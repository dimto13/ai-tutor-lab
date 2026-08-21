import type { TrainingStatePersistence } from "./trainingStatePersistence";

const CHALLENGE_ATTEMPT_HISTORY_VERSION = 1 as const;
export const CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID = "platform::challenge-attempt-history";

export interface ChallengeAttemptHistory {
  version: typeof CHALLENGE_ATTEMPT_HISTORY_VERSION;
  failedStartedAt: number[];
}

function emptyHistory(): ChallengeAttemptHistory {
  return {
    version: CHALLENGE_ATTEMPT_HISTORY_VERSION,
    failedStartedAt: [],
  };
}

export function parseChallengeAttemptHistory(value: unknown): ChallengeAttemptHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyHistory();
  const candidate = value as Partial<ChallengeAttemptHistory>;
  if (candidate.version !== CHALLENGE_ATTEMPT_HISTORY_VERSION) return emptyHistory();
  if (!Array.isArray(candidate.failedStartedAt)) return emptyHistory();

  return {
    version: CHALLENGE_ATTEMPT_HISTORY_VERSION,
    failedStartedAt: [
      ...new Set(
        candidate.failedStartedAt.filter(
          (startedAt): startedAt is number => Number.isFinite(startedAt) && startedAt >= 0,
        ),
      ),
    ].sort((left, right) => left - right),
  };
}

export async function loadChallengeAttemptHistory(
  persistence: TrainingStatePersistence,
): Promise<ChallengeAttemptHistory> {
  return parseChallengeAttemptHistory(
    await persistence.loadRuntimeSnapshot(CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID),
  );
}

export async function recordFailedChallengeAttempt(
  persistence: TrainingStatePersistence,
  startedAt: number,
): Promise<ChallengeAttemptHistory> {
  const current = await loadChallengeAttemptHistory(persistence);
  if (current.failedStartedAt.includes(startedAt)) return current;

  const next: ChallengeAttemptHistory = {
    version: CHALLENGE_ATTEMPT_HISTORY_VERSION,
    failedStartedAt: [...current.failedStartedAt, startedAt].sort((left, right) => left - right),
  };
  await persistence.saveRuntimeSnapshot(CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID, next);
  return next;
}

export function shouldRecommendGuidedAfterChallenge(
  history: ChallengeAttemptHistory,
  threshold = 2,
): boolean {
  return history.failedStartedAt.length >= threshold;
}
