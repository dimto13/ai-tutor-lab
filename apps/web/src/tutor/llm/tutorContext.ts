import { isAuthoredStepFailure, type TrainingMode } from "@ai-train-lab/training-engine";
import type { Scenario } from "@/types/training";
import { getRuntimeReferenceDefinition } from "../../runtime/referenceCatalog.ts";
import { getPlatformTopics } from "../platformKnowledge.ts";
import type { TutorLlmContext } from "./tutorGuardrails";
import { summarizeTutorLiveSnapshot, type TutorLiveSnapshot } from "./tutorLiveSnapshot.ts";

// Pure so the server route and the live acceptance script build the identical tutor context.
export function buildTutorContext(
  scenario: Scenario,
  mode: TrainingMode,
  currentStepId: string | null,
  lastFailure: string | null = null,
  liveSnapshot?: TutorLiveSnapshot,
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

  const scenarioDescription = scenario.description.trim().slice(0, 1_200);
  const authoredFailures = step?.onFailure
    ? [
        step.onFailure.message,
        ...Object.values(step.onFailure.fieldMessages ?? {}),
      ]
    : [];
  const reportedLearnerState = summarizeTutorLiveSnapshot(
    liveSnapshot,
    scenario.steps.map((candidate) => candidate.id),
    currentStepId,
    mode === "guided" ? authoredFailures : [],
  );
  const completedStepIds = new Set(reportedLearnerState?.completedStepIds ?? []);
  const activeIndex = currentStepId
    ? scenario.steps.findIndex((candidate) => candidate.id === currentStepId)
    : -1;
  // Keep the current step visible even in unusually long authored curricula. A bounded
  // neighbourhood is preferable to silently showing only the first 80 unrelated steps.
  const workflowWindowStart =
    activeIndex >= 80
      ? Math.min(Math.max(0, activeIndex - 39), Math.max(0, scenario.steps.length - 80))
      : 0;
  // Every module uses its own parsed scenario; no VS Code / M365 / other module-specific rules.
  // Challenge gets objectives, not a solution sequence or graded hints.
  const workflow = {
    learningObjectives: (scenario.learningObjectives ?? []).map((goal) => goal.trim().slice(0, 240)),
    totalSteps: scenario.steps.length,
    currentStepNumber: mode !== "challenge" && activeIndex >= 0 ? activeIndex + 1 : null,
    steps:
      mode === "challenge"
        ? []
        : scenario.steps
            .slice(workflowWindowStart, workflowWindowStart + 80)
            .map((candidate, index) => ({
            id: candidate.id,
            title: candidate.title.trim().slice(0, 160),
            position: workflowWindowStart + index + 1,
            status: completedStepIds.has(candidate.id)
              ? ("reported_completed" as const)
              : candidate.id === currentStepId
                ? ("current" as const)
                : ("not_reported" as const),
          })),
  };
  return {
    scenarioTitle: scenario.title,
    ...(scenarioDescription ? { scenarioDescription } : {}),
    mode,
    workflow,
    ...(reportedLearnerState ? { reportedLearnerState } : {}),
    step: step
      ? {
          id: step.id,
          title: step.title,
          instruction: step.instruction,
          rationale: step.rationale ?? step.why ?? null,
          ...(mode === "guided"
            ? {
                description: step.description?.trim().slice(0, 800) || null,
                expectedOutcome: step.successMessage?.trim().slice(0, 320) || null,
              }
            : {}),
          // Only Guided receives pre-authored help levels. Challenge must not leak solutions.
          ...(mode === "guided"
            ? {
                helpLevels: (step.helpLevels ?? [])
                  .map((hint) => hint.trim())
                  .filter((hint) => hint.length > 0 && hint !== "__highlight__"),
                // A possible diagnostic clue, not evidence of an actual user failure.
                possibleFailure: step.onFailure?.message?.trim() || null,
                // Preserve #601: only current-step authored failures are trusted.
                ...(lastFailure && isAuthoredStepFailure(step, lastFailure) ? { lastFailure } : {}),
              }
            : {}),
        }
      : null,
    stepUiTargetRefs: [...stepUiTargetRefs],
    allowedUiTargetRefs: [...new Set([...stepUiTargetRefs, ...Object.keys(uiTargetLabels)])],
    uiTargetLabels,
    platformKnowledge: getPlatformTopics().map(({ title, answer }) => ({ title, answer })),
  };
}
