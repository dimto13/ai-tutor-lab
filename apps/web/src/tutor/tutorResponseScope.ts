/**
 * A tutor response may describe the step that was visible when its model request began.
 * Do not apply a delayed response or UI highlight to a later step or a different module.
 * This does not reset conversation history when a learner advances within one module.
 */
export function shouldApplyTutorResponse(
  request: {
    version: number;
    scope: string;
    displayedStepId: string | null;
  },
  current: {
    version: number;
    scope: string;
    displayedStepId: string | null;
  },
): boolean {
  return (
    request.version === current.version &&
    request.scope === current.scope &&
    request.displayedStepId === current.displayedStepId
  );
}
