import assert from "node:assert/strict";
import test from "node:test";
import type { AppendScoreEventResult } from "@ai-train-lab/training-engine";
import {
  confirmedCompletionFinishedAt,
  confirmedCompletionSave,
  failedCompletionSave,
  pendingCompletionSave,
} from "../src/completion/completionSaveConfirmation.ts";
import {
  awardOnce,
  completionKey,
  resetCompletionLedger,
} from "../src/scoring/completionAwardLifecycle.ts";

function awardResult(): AppendScoreEventResult {
  return {
    created: true,
    event: {
      id: "event-guided-456",
      scenarioId: "vscode-basics.guided",
      scenarioVersion: 1,
      mode: "guided",
      points: 10,
      occurredAt: 1_000,
      breakdown: {
        basePoints: 10,
        bonusPoints: 0,
        bonusDeductionPoints: 0,
        modeMultiplier: 1,
      },
    },
  } as unknown as AppendScoreEventResult;
}

test("a delayed completion save sends zero score requests before confirmation and exactly one after", async () => {
  resetCompletionLedger();
  const finishedAt = 42_000;
  let confirmation = pendingCompletionSave(finishedAt);
  let scoreRequests = 0;

  const maybeAward = async () => {
    const scoreFinishedAt = confirmedCompletionFinishedAt(finishedAt, confirmation);
    if (scoreFinishedAt === null) return;

    const key = completionKey(
      "user-a",
      "tenant-a",
      "vscode-basics.guided",
      "guided",
      scoreFinishedAt,
    );
    await awardOnce(key, async () => {
      scoreRequests += 1;
      return awardResult();
    });
  };

  await maybeAward();
  assert.equal(scoreRequests, 0, "pending persistence must keep scoring locked");

  let resolveSave!: () => void;
  const save = new Promise<void>((resolve) => {
    resolveSave = resolve;
  });
  const confirmationTask = save.then(() => {
    confirmation = confirmedCompletionSave(finishedAt);
  });

  await maybeAward();
  assert.equal(scoreRequests, 0, "a still unresolved save must not leak a score request");

  resolveSave();
  await confirmationTask;

  await Promise.all([maybeAward(), maybeAward()]);
  assert.equal(scoreRequests, 1, "confirmation unlocks one idempotent server award");
});

test("a failed completion save never unlocks scoring", () => {
  const finishedAt = 99;
  assert.equal(confirmedCompletionFinishedAt(finishedAt, failedCompletionSave(finishedAt)), null);
});

test("a confirmation is bound to the exact completion key", () => {
  assert.equal(confirmedCompletionFinishedAt(101, confirmedCompletionSave(100)), null);
  assert.equal(confirmedCompletionFinishedAt(100, confirmedCompletionSave(100)), 100);
});
