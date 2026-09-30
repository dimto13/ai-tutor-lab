import assert from "node:assert/strict";
import test from "node:test";
import type { AppendScoreEventResult } from "@ai-train-lab/training-engine";
import {
  ATTESTATION_FAILURE_MESSAGE,
  AWARD_FAILURE_MESSAGE,
  attestationIssued,
  awardOnce,
  completionKey,
  failureMessage,
  issueAttestationOnce,
  rememberedAward,
  resetCompletionLedger,
} from "../src/scoring/completionAwardLifecycle.ts";

function award(points: number): AppendScoreEventResult {
  return {
    created: true,
    event: {
      id: `event-${points}`,
      scenarioId: "vscode-shortcuts.challenge",
      scenarioVersion: 1,
      mode: "challenge",
      points,
      occurredAt: 1_000,
      breakdown: {
        basePoints: points,
        bonusPoints: 0,
        bonusDeductionPoints: 0,
        modeMultiplier: 1,
      },
    },
  } as unknown as AppendScoreEventResult;
}

function key(finishedAt: number): string {
  return completionKey("user-a", "tenant-a", "vscode-shortcuts.challenge", "challenge", finishedAt);
}

test("a completion is awarded once even when several completion screens ask concurrently", async () => {
  resetCompletionLedger();
  const completion = key(42);
  let starts = 0;

  const start = async () => {
    starts += 1;
    return award(10);
  };
  const [first, second] = await Promise.all([
    awardOnce(completion, start),
    awardOnce(completion, start),
  ]);

  assert.equal(starts, 1);
  assert.equal(first, second);
  assert.equal(rememberedAward(completion)?.event.points, 10);
});

test("a failed attestation leaves the awarded score remembered and re-issues only the attestation", async () => {
  resetCompletionLedger();
  const completion = key(7);
  let awardStarts = 0;
  let attestationStarts = 0;

  await awardOnce(completion, async () => {
    awardStarts += 1;
    return award(25);
  });

  await assert.rejects(
    issueAttestationOnce(completion, async () => {
      attestationStarts += 1;
      throw new Error("Nachweisdienst nicht erreichbar");
    }),
    /Nachweisdienst nicht erreichbar/,
  );

  assert.equal(rememberedAward(completion)?.event.points, 25);
  assert.equal(attestationIssued(completion), false);

  const retried = await awardOnce(completion, async () => {
    awardStarts += 1;
    return award(99);
  });
  await issueAttestationOnce(completion, async () => {
    attestationStarts += 1;
  });

  assert.equal(awardStarts, 1, "a remembered award is never replayed");
  assert.equal(attestationStarts, 2);
  assert.equal(retried.event.points, 25);
  assert.equal(attestationIssued(completion), true);
});

test("a failed award is not remembered and is retried on the next attempt", async () => {
  resetCompletionLedger();
  const completion = key(11);

  await assert.rejects(
    awardOnce(completion, async () => {
      throw new Error("ServiceUnavailable");
    }),
    /ServiceUnavailable/,
  );
  assert.equal(rememberedAward(completion), null);

  const second = await awardOnce(completion, async () => award(5));
  assert.equal(second.event.points, 5);
});

test("an issued attestation is never issued twice for the same completion", async () => {
  resetCompletionLedger();
  const completion = key(3);
  let starts = 0;

  const start = async () => {
    starts += 1;
  };
  await issueAttestationOnce(completion, start);
  await issueAttestationOnce(completion, start);

  assert.equal(starts, 1);
});

test("a missing tenant is its own key and does not collide with an empty one", () => {
  // `UserIdentity.tenantId` darf leer sein. Faellt dieser Fall mit dem Mandanten "" zusammen,
  // unterdrueckt der Ledger genau ueber die Mandantengrenze hinweg, die er trennen soll.
  const withoutTenant = completionKey("user-a", null, "a", "guided", 1);
  assert.notEqual(withoutTenant, completionKey("user-a", "", "a", "guided", 1));
  assert.notEqual(withoutTenant, completionKey("user-b", null, "a", "guided", 1));
  assert.equal(withoutTenant, completionKey("user-a", null, "a", "guided", 1));
});

test("completion keys separate identity, tenant, scenario, mode and completion timestamp", () => {
  const base = completionKey("user-a", "tenant-a", "a", "guided", 1);
  assert.notEqual(base, completionKey("user-a", "tenant-a", "a", "guided", 2));
  assert.notEqual(base, completionKey("user-a", "tenant-a", "a", "challenge", 1));
  assert.notEqual(base, completionKey("user-a", "tenant-a", "b", "guided", 1));
  assert.notEqual(base, completionKey("user-b", "tenant-a", "a", "guided", 1));
  assert.notEqual(base, completionKey("user-a", "tenant-b", "a", "guided", 1));
});

test("remembered awards and attestations cannot cross authenticated identities", async () => {
  resetCompletionLedger();
  const firstUser = completionKey("user-a", "tenant-a", "same", "challenge", 100);
  const secondUser = completionKey("user-b", "tenant-a", "same", "challenge", 100);

  await awardOnce(firstUser, async () => award(10));
  await issueAttestationOnce(firstUser, async () => {});

  assert.equal(rememberedAward(firstUser)?.event.points, 10);
  assert.equal(attestationIssued(firstUser), true);
  assert.equal(rememberedAward(secondUser), null);
  assert.equal(attestationIssued(secondUser), false);

  let secondUserAwardStarts = 0;
  let secondUserAttestationStarts = 0;
  await awardOnce(secondUser, async () => {
    secondUserAwardStarts += 1;
    return award(20);
  });
  await issueAttestationOnce(secondUser, async () => {
    secondUserAttestationStarts += 1;
  });

  assert.equal(secondUserAwardStarts, 1);
  assert.equal(secondUserAttestationStarts, 1);
  assert.equal(rememberedAward(secondUser)?.event.points, 20);
});

test("failure messages prefer the server reason and fall back per outcome", () => {
  assert.equal(failureMessage(new Error("Throttled"), AWARD_FAILURE_MESSAGE), "Throttled");
  assert.equal(failureMessage("weird", AWARD_FAILURE_MESSAGE), AWARD_FAILURE_MESSAGE);
  assert.equal(
    failureMessage(new Error(""), ATTESTATION_FAILURE_MESSAGE),
    ATTESTATION_FAILURE_MESSAGE,
  );
  assert.notEqual(AWARD_FAILURE_MESSAGE, ATTESTATION_FAILURE_MESSAGE);
});
