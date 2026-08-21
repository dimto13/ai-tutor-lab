import { describe, expect, it, vi } from "vitest";
import type { TrainingStatePersistence } from "./trainingStatePersistence";
import {
  CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID,
  loadChallengeAttemptHistory,
  parseChallengeAttemptHistory,
  recordFailedChallengeAttempt,
  shouldRecommendGuidedAfterChallenge,
} from "./challengeAttemptHistory";

function persistenceDouble(initial: unknown = null) {
  let stored = initial;
  const persistence = {
    loadRuntimeSnapshot: vi.fn(async (runtimeId: string) => {
      expect(runtimeId).toBe(CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID);
      return stored;
    }),
    saveRuntimeSnapshot: vi.fn(async (runtimeId: string, value: unknown) => {
      expect(runtimeId).toBe(CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID);
      stored = value;
    }),
  } as unknown as TrainingStatePersistence;
  return { persistence, stored: () => stored };
}

describe("challengeAttemptHistory", () => {
  it("treats missing or malformed metadata as no failed attempts", () => {
    expect(parseChallengeAttemptHistory(null).failedStartedAt).toEqual([]);
    expect(parseChallengeAttemptHistory({ version: 99, failedStartedAt: [1, 2] }).failedStartedAt).toEqual(
      [],
    );
  });

  it("deduplicates persisted attempt identities and recommends Guided only after two failures", () => {
    const history = parseChallengeAttemptHistory({
      version: 1,
      failedStartedAt: [20, 10, 20, Number.NaN, -1],
    });
    expect(history.failedStartedAt).toEqual([10, 20]);
    expect(shouldRecommendGuidedAfterChallenge(history)).toBe(true);
    expect(shouldRecommendGuidedAfterChallenge({ version: 1, failedStartedAt: [10] })).toBe(false);
  });

  it("records one failure per challenge start and persists through the existing state boundary", async () => {
    const { persistence, stored } = persistenceDouble();

    const first = await recordFailedChallengeAttempt(persistence, 100);
    expect(first.failedStartedAt).toEqual([100]);
    expect(shouldRecommendGuidedAfterChallenge(first)).toBe(false);

    const duplicate = await recordFailedChallengeAttempt(persistence, 100);
    expect(duplicate.failedStartedAt).toEqual([100]);

    const second = await recordFailedChallengeAttempt(persistence, 200);
    expect(second.failedStartedAt).toEqual([100, 200]);
    expect(shouldRecommendGuidedAfterChallenge(second)).toBe(true);
    expect(stored()).toEqual(second);

    const restored = await loadChallengeAttemptHistory(persistence);
    expect(restored).toEqual(second);
  });
});
