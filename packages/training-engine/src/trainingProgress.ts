import type { Scenario, StepStatus } from "./types.ts";

const STEP_STATUSES = new Set<StepStatus>([
  "NOT_STARTED",
  "ACTIVE",
  "COMPLETED",
  "SKIPPED",
  "VALIDATION_FAILED",
]);

const isComplete = (status: StepStatus) => status === "COMPLETED" || status === "SKIPPED";

export interface StoredGuidedStepProgress {
  statuses: Record<string, unknown>;
  activeStepId?: string | null | undefined;
  finishedAt?: number | null | undefined;
}

export interface GuidedStepProgress {
  statuses: Record<string, StepStatus>;
  activeStepId: string | null;
  finishedAt: number | null;
}

export function findNextIncompleteStepId(
  scenario: Scenario,
  statuses: Record<string, StepStatus>,
  completedStepId: string,
): string | null {
  const completedIndex = scenario.steps.findIndex((step) => step.id === completedStepId);
  if (completedIndex < 0) return null;

  for (const step of scenario.steps.slice(completedIndex + 1)) {
    const status = statuses[step.id] ?? "NOT_STARTED";
    if (!isComplete(status)) return step.id;
  }

  for (const step of scenario.steps.slice(0, completedIndex)) {
    const status = statuses[step.id] ?? "NOT_STARTED";
    if (!step.optional && status === "NOT_STARTED") return step.id;
  }
  return null;
}

/**
 * Reconciles persisted guided progress with the current scenario structure.
 * Existing results survive content updates; newly introduced optional steps
 * are skipped for returning learners instead of blocking their old progress.
 */
export function normalizeGuidedStepProgress(
  scenario: Scenario,
  stored: StoredGuidedStepProgress,
  now = Date.now(),
): GuidedStepProgress {
  const statuses = Object.fromEntries(
    scenario.steps.map((step) => {
      const storedStatus = stored.statuses[step.id];
      const status = STEP_STATUSES.has(storedStatus as StepStatus)
        ? (storedStatus as StepStatus)
        : step.optional
          ? "SKIPPED"
          : "NOT_STARTED";
      return [step.id, status];
    }),
  );

  const allComplete = scenario.steps.every((step) => isComplete(statuses[step.id]!));
  if (allComplete) {
    return {
      statuses,
      activeStepId: null,
      finishedAt: typeof stored.finishedAt === "number" ? stored.finishedAt : now,
    };
  }

  const storedActiveStep =
    typeof stored.activeStepId === "string" &&
    Object.hasOwn(statuses, stored.activeStepId) &&
    !isComplete(statuses[stored.activeStepId]!)
      ? stored.activeStepId
      : null;
  const activeStepId =
    storedActiveStep ??
    scenario.steps.find((step) => statuses[step.id] === "ACTIVE")?.id ??
    scenario.steps.find((step) => !isComplete(statuses[step.id]!))?.id ??
    null;

  for (const step of scenario.steps) {
    if (statuses[step.id] === "ACTIVE" && step.id !== activeStepId) {
      statuses[step.id] = "NOT_STARTED";
    }
  }
  if (activeStepId && statuses[activeStepId] === "NOT_STARTED") {
    statuses[activeStepId] = "ACTIVE";
  }

  return { statuses, activeStepId, finishedAt: null };
}
