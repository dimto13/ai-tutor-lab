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

test("a completion is awarded once even when several completion screens ask concurrently", async () => {
  resetCompletionLedger();
  const key = completionKey("vscode-shortcuts.challenge", "challenge", 42);
  let starts = 0;

  const start = async () => {
    starts += 1;
    return award(10);
  };
  const [first, second] = await Promise.all([awardOnce(key, start), awardOnce(key, start)]);

  assert.equal(starts, 1);
  assert.equal(first, second);
  assert.equal(rememberedAward(key)?.event.points, 10);
});

test("a failed attestation leaves the awarded score remembered and re-issues only the attestation", async () => {
  resetCompletionLedger();
  const key = completionKey("vscode-shortcuts.challenge", "challenge", 7);
  let awardStarts = 0;
  let attestationStarts = 0;

  await awardOnce(key, async () => {
    awardStarts += 1;
    return award(25);
  });

  await assert.rejects(
    issueAttestationOnce(key, async () => {
      attestationStarts += 1;
      throw new Error("Nachweisdienst nicht erreichbar");
    }),
    /Nachweisdienst nicht erreichbar/,
  );

  // The score survived the attestation failure.
  assert.equal(rememberedAward(key)?.event.points, 25);
  assert.equal(attestationIssued(key), false);

  // Retrying re-uses the award and starts exactly one new attestation.
  const retried = await awardOnce(key, async () => {
    awardStarts += 1;
    return award(99);
  });
  await issueAttestationOnce(key, async () => {
    attestationStarts += 1;
  });

  assert.equal(awardStarts, 1, "a remembered award is never replayed");
  assert.equal(attestationStarts, 2);
  assert.equal(retried.event.points, 25);
  assert.equal(attestationIssued(key), true);
});

test("a failed award is not remembered and is retried on the next attempt", async () => {
  resetCompletionLedger();
  const key = completionKey("vscode-shortcuts.challenge", "challenge", 11);

  await assert.rejects(
    awardOnce(key, async () => {
      throw new Error("ServiceUnavailable");
    }),
    /ServiceUnavailable/,
  );
  assert.equal(rememberedAward(key), null);

  const second = await awardOnce(key, async () => award(5));
  assert.equal(second.event.points, 5);
});

test("an issued attestation is never issued twice for the same completion", async () => {
  resetCompletionLedger();
  const key = completionKey("vscode-shortcuts.challenge", "challenge", 3);
  let starts = 0;

  const start = async () => {
    starts += 1;
  };
  await issueAttestationOnce(key, start);
  await issueAttestationOnce(key, start);

  assert.equal(starts, 1);
});

test("completion keys separate scenario, mode and completion timestamp", () => {
  assert.notEqual(
    completionKey("a", "guided", 1),
    completionKey("a", "guided", 2),
    "a second run must be able to earn its own award",
  );
  assert.notEqual(completionKey("a", "guided", 1), completionKey("a", "challenge", 1));
  assert.notEqual(completionKey("a", "guided", 1), completionKey("b", "guided", 1));
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
