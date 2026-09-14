import type { TrainingMode } from "@ai-train-lab/training-engine";
import type { Scenario } from "@/types/training";
import { getRuntimeReferenceDefinition } from "../../runtime/referenceCatalog.ts";
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
  const stepUiTargetRefs = new Set<string>();
  if (step?.highlightTarget) stepUiTargetRefs.add(step.highlightTarget);
  if (step?.onFailure?.markTarget) stepUiTargetRefs.add(step.onFailure.markTarget);
  if (mode === "explore") {
    for (const target of scenario.exploreTargets ?? []) stepUiTargetRefs.add(target);
  }

  // Learners also ask about the tool beyond the current step (#476). The runtime catalog lets the
  // tutor answer and point at real elements without inventing any.
  const uiTargetLabels: Record<string, string> = {};
  const runtimeAdapterIds = [
    scenario.environment?.runtimeAdapterId,
    ...(scenario.environment?.integrations?.map(({ runtimeAdapterId }) => runtimeAdapterId) ?? []),
  ];
  for (const runtimeAdapterId of runtimeAdapterIds) {
    if (!runtimeAdapterId) continue;
    for (const target of getRuntimeReferenceDefinition(runtimeAdapterId)?.surface ?? []) {
      uiTargetLabels[target.ref] ??= target.label;
    }
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
    stepUiTargetRefs: [...stepUiTargetRefs],
    allowedUiTargetRefs: [...new Set([...stepUiTargetRefs, ...Object.keys(uiTargetLabels)])],
    uiTargetLabels,
  };
}
