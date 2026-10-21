import type { TrainingSession } from "./stateMachine.ts";
import type { EngineValidationResult, TrainingStep, Validation } from "./types.ts";

export const DEFAULT_STEP_FAILURE_MESSAGE =
  "Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis.";

/**
 * Learner-facing message for a relevant action that did not satisfy the step. The message
 * authored for the failed field comes first: a generic "der erwartete Inhalt fehlt noch" left
 * learners guessing which part of their input was wrong (#591).
 */
export function stepFailureMessage(
  step: Pick<TrainingStep, "onFailure">,
  result: EngineValidationResult,
): string {
  const field = result.details?.["field"];
  const fieldMessages = step.onFailure?.fieldMessages;
  const fieldMessage =
    typeof field === "string" && fieldMessages && Object.hasOwn(fieldMessages, field)
      ? fieldMessages[field]
      : undefined;
  return fieldMessage ?? step.onFailure?.message ?? result.message ?? DEFAULT_STEP_FAILURE_MESSAGE;
}

/** Whether the step itself authored this failure text; the engine's generic messages explain nothing. */
export function isAuthoredStepFailure(
  step: Pick<TrainingStep, "onFailure">,
  message: string,
): boolean {
  const onFailure = step.onFailure;
  if (!onFailure) return false;
  return (
    onFailure.message === message || Object.values(onFailure.fieldMessages ?? {}).includes(message)
  );
}

/**
 * Message of the latest failed attempt at a step that is not done yet, so a reload or the tutor
 * still know why the step is open. `null` when the step has no failed attempt.
 */
export function latestStepFailureMessage(
  session: Pick<TrainingSession, "attempts" | "statuses">,
  stepId: string,
): string | null {
  const status = session.statuses[stepId];
  if (status === "COMPLETED" || status === "SKIPPED") return null;
  for (let index = session.attempts.length - 1; index >= 0; index -= 1) {
    const attempt = session.attempts[index]!;
    if (attempt.stepId !== stepId) continue;
    return attempt.outcome === "near-miss" ? (attempt.message ?? null) : null;
  }
  return null;
}

/** Whether a validation reacts to a learner action itself, not only to the state it leaves. */
function hasActionCondition(validation: Validation): boolean {
  switch (validation.kind) {
    case "event":
    case "classification":
      return true;
    case "state":
      return false;
    case "not":
      return hasActionCondition(validation.of);
    case "sequence":
    case "all":
    case "any":
      return validation.of.some(hasActionCondition);
  }
}

/**
 * Whether a near-miss is worth telling the learner. A step that checks only state is evaluated
 * after every action, so the first of two required clicks, or opening the panel the step asks
 * for, already reads as a failure: the M365 guide said "erfüllt aber noch nicht das erwartete
 * Ergebnis" after a correct first source (#591). Such a step therefore reports a near-miss only
 * for a field it wrote a message for; everything else is progress and stays silent.
 */
export function reportsNearMiss(
  step: Pick<TrainingStep, "onFailure" | "validation" | "expectedEvent" | "validate">,
  result: EngineValidationResult,
): boolean {
  if (result.outcome !== "near-miss") return false;
  if (step.expectedEvent || step.validate || !step.validation) return true;
  if (hasActionCondition(step.validation)) return true;
  const field = result.details?.["field"];
  const fieldMessages = step.onFailure?.fieldMessages;
  return (
    typeof field === "string" && fieldMessages !== undefined && Object.hasOwn(fieldMessages, field)
  );
}

/** Every field a validation can report as failed; `onFailure.fieldMessages` keys must be one. */
export function validationFailureFields(validation: Validation): string[] {
  switch (validation.kind) {
    case "event":
      return [
        ...Object.keys(validation.match ?? {}),
        ...Object.keys(validation.contains ?? {}),
        ...Object.keys(validation.containsAny ?? {}),
        ...Object.keys(validation.minWords ?? {}),
      ];
    case "state":
      return [validation.selector, ...Object.keys(validation.match ?? {})];
    case "classification":
      return [];
    case "not":
      // A negated condition that holds reports the kind of the negated validation.
      return [validation.of.kind];
    case "sequence":
    case "all":
    case "any":
      return validation.of.flatMap(validationFailureFields);
  }
}
