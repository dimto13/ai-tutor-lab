import { useEffect, useMemo, useState } from "react";
import { getRuntimeAdapter } from "@/runtime";
import { useTraining } from "@/state/trainingStore";
import type { Scenario, TrainingEvent, TrainingMode, TrainingStep } from "@/types/training";

export interface TutorStateSummary {
  completedSteps: number;
  totalSteps: number;
  isFinished: boolean;
  exploredTargets: number;
  hintsUsed: number;
  mistakes: number;
}

export interface TutorContext {
  scenario: Pick<Scenario, "id" | "title" | "description" | "learningObjectives">;
  mode: TrainingMode;
  currentStep: TrainingStep | null;
  completedStepIds: string[];
  recentEvents: TrainingEvent[];
  hintUsage: number;
  failedAttempts: number;
  stateSummary: TutorStateSummary;
}

export function useTutorContext(): TutorContext {
  const { scenario, mode, progress, isFinished } = useTraining();
  const [recentEvents, setRecentEvents] = useState<TrainingEvent[]>([]);

  useEffect(() => {
    setRecentEvents([]);
    const runtime = getRuntimeAdapter(scenario.environment?.runtimeAdapterId);
    if (!runtime) return;

    return runtime.subscribe((event) => {
      setRecentEvents((events) => [...events, event].slice(-10));
    });
  }, [scenario.id, scenario.environment?.runtimeAdapterId]);

  return useMemo(() => {
    const completedStepIds = scenario.steps
      .filter((step) => progress.statuses[step.id] === "COMPLETED")
      .map((step) => step.id);

    // #231 exposes visibleProgress through useTraining(). During replay its
    // activeStepId is the displayed/replayed step while the canonical
    // furthest-reached progress remains owned by the Guided navigation layer.
    const displayedStep = scenario.steps.find((step) => step.id === progress.activeStepId) ?? null;

    return {
      scenario: {
        id: scenario.id,
        title: scenario.title,
        description: scenario.description,
        ...(scenario.learningObjectives ? { learningObjectives: scenario.learningObjectives } : {}),
      },
      mode,
      currentStep: displayedStep,
      completedStepIds,
      recentEvents,
      hintUsage: progress.hintsUsed,
      failedAttempts: progress.mistakes,
      stateSummary: {
        completedSteps: completedStepIds.length,
        totalSteps: scenario.steps.length,
        isFinished,
        exploredTargets: progress.exploredTargets.length,
        hintsUsed: progress.hintsUsed,
        mistakes: progress.mistakes,
      },
    };
  }, [scenario, mode, progress, isFinished, recentEvents]);
}
