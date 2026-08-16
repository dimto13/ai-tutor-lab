import type { TrainingSession } from "./stateMachine.ts";

/**
 * Returns a failed Guided step to ACTIVE after its runtime state was recovered.
 *
 * Attempts, mistake counters, completed/skipped steps and all scoring-relevant
 * session facts intentionally remain untouched.
 */
export function resumeGuidedStepAfterRecovery(
  session: TrainingSession,
  stepId: string,
): TrainingSession {
  if (
    session.mode !== "guided" ||
    session.finishedAt !== null ||
    session.activeStepId !== stepId ||
    session.statuses[stepId] !== "VALIDATION_FAILED"
  ) {
    return session;
  }

  return {
    ...session,
    statuses: { ...session.statuses, [stepId]: "ACTIVE" },
  };
}
