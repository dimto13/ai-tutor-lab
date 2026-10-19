import { useMemo } from "react";
import type {
  FeedbackContextSnapshot,
  FeedbackSource,
  FeedbackViewportClass,
} from "@/lib/feedbackStore";
import { getRuntimeAdapter } from "@/runtime";
import { useTraining } from "@/state/trainingStore";

export type FeedbackContextDraft = Omit<FeedbackContextSnapshot, "timestamp"> & {
  runtime: NonNullable<FeedbackContextSnapshot["runtime"]>;
};

export function viewportClass(): FeedbackViewportClass {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth <= 359) return "compact";
  if (window.innerWidth <= 767) return "small";
  if (window.innerWidth <= 1279) return "medium";
  return "large";
}

/** The structured, data-minimal context every feedback record carries, shared by dialog and chat. */
export function useFeedbackContext(source: FeedbackSource): FeedbackContextDraft {
  const { scenario, mode, progress } = useTraining();
  const runtimeAdapterId = scenario.environment?.runtimeAdapterId;
  const runtimeAdapter = useMemo(() => getRuntimeAdapter(runtimeAdapterId), [runtimeAdapterId]);

  const stepId =
    progress.activeStepId ?? (source === "completion" ? (scenario.steps.at(-1)?.id ?? null) : null);

  return useMemo(
    () => ({
      scenarioId: scenario.id,
      stepId,
      mode,
      runtimeAdapterId: runtimeAdapterId ?? null,
      runtime: {
        productId: runtimeAdapter?.productId ?? null,
        capabilities: [...(runtimeAdapter?.capabilities ?? [])],
        viewportClass: viewportClass(),
        stepStatus: stepId ? (progress.statuses[stepId] ?? null) : null,
        hintsUsed: progress.hintsUsed,
        mistakes: progress.mistakes,
      },
      appVersion: import.meta.env["VITE_APP_VERSION"] || "0.0.0-local",
      commit: import.meta.env["VITE_APP_COMMIT_SHA"] || "local",
    }),
    [
      mode,
      progress.hintsUsed,
      progress.mistakes,
      progress.statuses,
      runtimeAdapter,
      runtimeAdapterId,
      scenario.id,
      stepId,
    ],
  );
}
