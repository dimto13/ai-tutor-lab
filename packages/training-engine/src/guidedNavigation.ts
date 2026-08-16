import type { TrainingSession } from "./stateMachine.ts";
import type { Scenario } from "./types.ts";

/**
 * Returns whether a Guided step may be deliberately revisited.
 *
 * Navigation is progress-preserving: only the canonical active step and steps
 * that were actually completed are reachable. Skipped and not-yet-reached
 * steps stay outside this contract so navigation cannot bypass Guided flow.
 */
export function canNavigateToGuidedStep(
  session: TrainingSession,
  scenario: Scenario,
  stepId: string,
): boolean {
  if (session.mode !== "guided" || session.finishedAt !== null) return false;
  if (!scenario.steps.some((step) => step.id === stepId)) return false;
  if (session.activeStepId === stepId) return true;
  return session.statuses[stepId] === "COMPLETED";
}
