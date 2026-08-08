import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { workspaceBus } from "./eventBus";
import { getScenario } from "@/scenarios";
import type { Scenario, StepStatus, WorkspaceEvent } from "@/types/training";

const storageKey = (scenarioId: string) => `ai-training-lab:${scenarioId}:v1`;

export interface TrainingProgress {
  statuses: Record<string, StepStatus>;
  activeStepId: string | null;
  startedAt: number;
  finishedAt: number | null;
  hintsUsed: number;
  mistakes: number;
  lastAction: string | null;
}

interface TrainingContextValue {
  scenario: Scenario;
  progress: TrainingProgress;
  activeStepIndex: number;
  completedCount: number;
  percent: number;
  isFinished: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  helpLevel: number;
  revealHelp: () => void;
  resetHelp: () => void;
  restart: () => void;
  registerMistake: (message: string) => void;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);

function initialProgress(scenario: Scenario): TrainingProgress {
  const statuses: Record<string, StepStatus> = {};
  scenario.steps.forEach((s, i) => {
    statuses[s.id] = i === 0 ? "ACTIVE" : "NOT_STARTED";
  });
  return {
    statuses,
    activeStepId: scenario.steps[0]!.id,
    startedAt: Date.now(),
    finishedAt: null,
    hintsUsed: 0,
    mistakes: 0,
    lastAction: null,
  };
}

function load(scenario: Scenario): TrainingProgress {
  if (typeof window === "undefined") return initialProgress(scenario);
  try {
    const raw = window.localStorage.getItem(storageKey(scenario.id));
    if (!raw) return initialProgress(scenario);
    const parsed = JSON.parse(raw) as TrainingProgress;
    if (!parsed?.statuses) return initialProgress(scenario);
    return parsed;
  } catch {
    return initialProgress(scenario);
  }
}

export function TrainingProvider({
  scenarioId,
  children,
}: {
  scenarioId: string;
  children: ReactNode;
}) {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown training scenario: ${scenarioId}`);

  const [progress, setProgress] = useState<TrainingProgress>(() => initialProgress(scenario));
  const [hydrated, setHydrated] = useState(false);
  const [feedback, setFeedback] = useState<TrainingContextValue["feedback"]>(null);
  const [helpLevel, setHelpLevel] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    setHydrated(false);
    setProgress(load(scenario));
    setHelpLevel(0);
    setFeedback(null);
    setHydrated(true);
  }, [scenario]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey(scenario.id), JSON.stringify(progress));
  }, [progress, hydrated, scenario.id]);

  // Training engine: reacts to workspace events, never to "next" buttons.
  useEffect(() => {
    const unsubscribe = workspaceBus.subscribe((event: WorkspaceEvent) => {
      const current = progressRef.current;
      const stepId = current.activeStepId;
      setProgress((p) => ({ ...p, lastAction: event.name }));
      if (!stepId) return;
      const step = scenario.steps.find((s) => s.id === stepId);
      if (!step || step.expectedEvent !== event.name) return;

      const result = step.validate ? step.validate(event.payload ?? {}) : { ok: true };
      if (result.ok) {
        const index = scenario.steps.findIndex((s) => s.id === stepId);
        const next = scenario.steps[index + 1];
        setProgress((p) => ({
          ...p,
          statuses: {
            ...p.statuses,
            [stepId]: "COMPLETED",
            ...(next ? { [next.id]: "ACTIVE" as StepStatus } : {}),
          },
          activeStepId: next ? next.id : null,
          finishedAt: next ? null : Date.now(),
        }));
        setHelpLevel(0);
        setFeedback({ kind: "success", message: step.successMessage });
      } else if (result.message) {
        // Typing in the editor is a continuous stream: show guidance, but don't
        // count every keystroke as a failed attempt.
        const counts = event.name !== "file.updated";
        if (counts) {
          setProgress((p) => ({
            ...p,
            mistakes: p.mistakes + 1,
            statuses: { ...p.statuses, [stepId]: "VALIDATION_FAILED" },
          }));
        }
        setFeedback((f) =>
          f && f.kind === "error" && f.message === result.message
            ? f
            : { kind: "error", message: result.message! },
        );
      }
    });
    return unsubscribe;
  }, [scenario]);

  useEffect(() => {
    if (feedback?.kind !== "success") return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  const value = useMemo<TrainingContextValue>(() => {
    const completedCount = scenario.steps.filter(
      (s) => progress.statuses[s.id] === "COMPLETED",
    ).length;
    const activeStepIndex = progress.activeStepId
      ? scenario.steps.findIndex((s) => s.id === progress.activeStepId)
      : scenario.steps.length;
    return {
      scenario,
      progress,
      activeStepIndex,
      completedCount,
      percent: Math.round((completedCount / scenario.steps.length) * 100),
      isFinished: completedCount === scenario.steps.length,
      feedback,
      helpLevel,
      revealHelp: () => {
        setHelpLevel((l) => {
          if (l >= 3) return l;
          setProgress((p) => ({ ...p, hintsUsed: p.hintsUsed + 1 }));
          return l + 1;
        });
      },
      resetHelp: () => setHelpLevel(0),
      restart: () => {
        setProgress(initialProgress(scenario));
        setHelpLevel(0);
        setFeedback(null);
      },
      registerMistake: (message: string) => {
        setProgress((p) => ({ ...p, mistakes: p.mistakes + 1 }));
        setFeedback({ kind: "error", message });
      },
    };
  }, [scenario, progress, feedback, helpLevel]);

  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

export function useTraining() {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error("useTraining must be used inside TrainingProvider");
  return ctx;
}

/** Read-only progress for one dashboard training (no provider needed). */
export function useStoredProgressPercent(scenarioId: string | null) {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    if (!scenarioId) {
      setPercent(0);
      return;
    }
    const scenario = getScenario(scenarioId);
    if (!scenario) {
      setPercent(0);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey(scenario.id));
      if (!raw) return setPercent(0);
      const parsed = JSON.parse(raw) as TrainingProgress;
      const done = scenario.steps.filter((s) => parsed.statuses?.[s.id] === "COMPLETED").length;
      setPercent(Math.round((done / scenario.steps.length) * 100));
    } catch {
      setPercent(0);
    }
  }, [scenarioId]);
  return percent;
}

export const useHighlightTarget = () => {
  const { progress, scenario, helpLevel } = useTraining();
  const step = scenario.steps.find((s) => s.id === progress.activeStepId);
  return useCallback(() => ({ step, helpLevel }), [step, helpLevel])();
};
