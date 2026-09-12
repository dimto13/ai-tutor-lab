import type { TrainingMode } from "@ai-train-lab/training-engine";
import type { Scenario } from "@/types/training";
import type { TutorLlmContext } from "./tutorGuardrails";

// Pure so the server route and the live acceptance script build the identical tutor context.
export function buildTutorContext(
  scenario: Scenario,
  mode: TrainingMode,
  currentStepId: string | null,
): TutorLlmContext {
  const step = currentStepId
    ? (scenario.steps.find((candidate) => candidate.id === currentStepId) ?? null)
    : null;
  if (currentStepId && !step) throw new Error("Unknown tutor step");
  const allowedUiTargetRefs = new Set<string>();
  if (step?.highlightTarget) allowedUiTargetRefs.add(step.highlightTarget);
  if (step?.onFailure?.markTarget) allowedUiTargetRefs.add(step.onFailure.markTarget);
  if (mode === "explore") {
    for (const target of scenario.exploreTargets ?? []) allowedUiTargetRefs.add(target);
  }
  return {
    scenarioTitle: scenario.title,
    mode,
    step: step
      ? {
          id: step.id,
          title: step.title,
          instruction: step.instruction,
          rationale: step.rationale ?? step.why ?? null,
        }
      : null,
    allowedUiTargetRefs: [...allowedUiTargetRefs],
  };
}
