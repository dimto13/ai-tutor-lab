import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrainingStatePersistence } from "../src/state/trainingStatePersistence.ts";
import {
  CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID,
  loadChallengeAttemptHistory,
  parseChallengeAttemptHistory,
  recordFailedChallengeAttempt,
  shouldRecommendGuidedAfterChallenge,
} from "../src/state/challengeAttemptHistory.ts";

function persistenceDouble(initial: unknown = null) {
  let stored = initial;
  const persistence = {
    async loadRuntimeSnapshot(runtimeId: string) {
      assert.equal(runtimeId, CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID);
      return stored;
    },
    async saveRuntimeSnapshot(runtimeId: string, value: unknown) {
      assert.equal(runtimeId, CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID);
      stored = value;
    },
  } as unknown as TrainingStatePersistence;
  return { persistence, stored: () => stored };
}

describe("challengeAttemptHistory", () => {
  it("treats missing or malformed metadata as no failed attempts", () => {
    assert.deepEqual(parseChallengeAttemptHistory(null).failedStartedAt, []);
    assert.deepEqual(
      parseChallengeAttemptHistory({ version: 99, failedStartedAt: [1, 2] }).failedStartedAt,
      [],
    );
  });

  it("deduplicates persisted attempt identities and recommends Guided only after two failures", () => {
    const history = parseChallengeAttemptHistory({
      version: 1,
      failedStartedAt: [20, 10, 20, Number.NaN, -1],
    });
    assert.deepEqual(history.failedStartedAt, [10, 20]);
    assert.equal(shouldRecommendGuidedAfterChallenge(history), true);
    assert.equal(shouldRecommendGuidedAfterChallenge({ version: 1, failedStartedAt: [10] }), false);
  });

  it("keeps only the most recent bounded failure identities", () => {
    const history = parseChallengeAttemptHistory({
      version: 1,
      failedStartedAt: Array.from({ length: 25 }, (_, index) => index + 1),
    });
    assert.deepEqual(
      history.failedStartedAt,
      Array.from({ length: 20 }, (_, index) => index + 6),
    );
  });

  it("records one valid failure per challenge start and persists through the existing state boundary", async () => {
    const { persistence, stored } = persistenceDouble();

    const invalid = await recordFailedChallengeAttempt(persistence, Number.NaN);
    assert.deepEqual(invalid.failedStartedAt, []);
    assert.equal(stored(), null);

    const first = await recordFailedChallengeAttempt(persistence, 100);
    assert.deepEqual(first.failedStartedAt, [100]);
    assert.equal(shouldRecommendGuidedAfterChallenge(first), false);

    const duplicate = await recordFailedChallengeAttempt(persistence, 100);
    assert.deepEqual(duplicate.failedStartedAt, [100]);

    const second = await recordFailedChallengeAttempt(persistence, 200);
    assert.deepEqual(second.failedStartedAt, [100, 200]);
    assert.equal(shouldRecommendGuidedAfterChallenge(second), true);
    assert.deepEqual(stored(), second);

    const restored = await loadChallengeAttemptHistory(persistence);
    assert.deepEqual(restored, second);
  });
});
