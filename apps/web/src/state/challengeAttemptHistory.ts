import type { TrainingSession } from "@ai-train-lab/training-engine";
import type { TrainingStatePersistence } from "./trainingStatePersistence";

const CHALLENGE_ATTEMPT_HISTORY_VERSION = 1 as const;
const MAX_FAILED_CHALLENGE_ATTEMPTS = 20;
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

function normalizeFailedStartedAt(values: unknown[]): number[] {
  return [
    ...new Set(
      values.filter(
        (startedAt): startedAt is number =>
          typeof startedAt === "number" && Number.isFinite(startedAt) && startedAt >= 0,
      ),
    ),
  ]
    .sort((left, right) => left - right)
    .slice(-MAX_FAILED_CHALLENGE_ATTEMPTS);
}

export function parseChallengeAttemptHistory(value: unknown): ChallengeAttemptHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyHistory();
  const candidate = value as Partial<ChallengeAttemptHistory>;
  if (candidate.version !== CHALLENGE_ATTEMPT_HISTORY_VERSION) return emptyHistory();
  if (!Array.isArray(candidate.failedStartedAt)) return emptyHistory();

  return {
    version: CHALLENGE_ATTEMPT_HISTORY_VERSION,
    failedStartedAt: normalizeFailedStartedAt(candidate.failedStartedAt),
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
  if (!Number.isFinite(startedAt) || startedAt < 0 || current.failedStartedAt.includes(startedAt)) {
    return current;
  }

  const next: ChallengeAttemptHistory = {
    version: CHALLENGE_ATTEMPT_HISTORY_VERSION,
    failedStartedAt: normalizeFailedStartedAt([...current.failedStartedAt, startedAt]),
  };
  await persistence.saveRuntimeSnapshot(CHALLENGE_ATTEMPT_HISTORY_RUNTIME_ID, next);
  return next;
}

/** Records a terminal failed challenge exactly once by its stable session start identity. */
export async function recordTimedOutChallengeAttempt(
  persistence: TrainingStatePersistence,
  session: TrainingSession,
): Promise<ChallengeAttemptHistory> {
  if (session.challengeOutcome !== "timed_out") {
    return loadChallengeAttemptHistory(persistence);
  }
  return recordFailedChallengeAttempt(persistence, session.startedAt);
}

export function shouldRecommendGuidedAfterChallenge(
  history: ChallengeAttemptHistory,
  threshold = 2,
): boolean {
  return history.failedStartedAt.length >= threshold;
}
