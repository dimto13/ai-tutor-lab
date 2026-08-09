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
import { getScenario } from "@/scenarios";
import { getRuntimeAdapterForSelector, getRuntimeAdapters } from "@/runtime";
import type {
  ChallengeOutcome,
  Scenario,
  StepStatus,
  TrainingEvent,
  TrainingMode,
  Validation,
  ValidationResult,
} from "@/types/training";

const storageKey = (scenarioId: string) => `ai-training-lab:${scenarioId}:v2`;

const modeOf = (scenario: Scenario): TrainingMode => scenario.mode ?? "guided";
const modeMultiplier = (mode: TrainingMode) =>
  mode === "explore" ? 0.5 : mode === "challenge" ? 2 : 1;

export interface TrainingProgress {
  statuses: Record<string, StepStatus>;
  activeStepId: string | null;
  startedAt: number;
  finishedAt: number | null;
  challengeOutcome: ChallengeOutcome | null;
  hintsUsed: number;
  mistakes: number;
  lastAction: string | null;
  exploredTargets: string[];
  lastInspectedRef: string | null;
}

interface TrainingContextValue {
  scenario: Scenario;
  mode: TrainingMode;
  progress: TrainingProgress;
  activeStepIndex: number;
  completedCount: number;
  percent: number;
  isFinished: boolean;
  isChallengeFailed: boolean;
  isReady: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  helpLevel: number;
  scoreMultiplier: number;
  earnedPoints: number;
  challengeOutcome: ChallengeOutcome | null;
  challengeRemainingSeconds: number | null;
  revealHelp: () => void;
  resetHelp: () => void;
  completeExplanationStep: () => void;
  restart: () => void;
  registerMistake: (message: string) => void;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);

function initialProgress(scenario: Scenario): TrainingProgress {
  const mode = modeOf(scenario);
  const statuses: Record<string, StepStatus> = {};
  scenario.steps.forEach((step, index) => {
    statuses[step.id] = mode === "explore" ? "NOT_STARTED" : index === 0 ? "ACTIVE" : "NOT_STARTED";
  });
  return {
    statuses,
    activeStepId: mode === "explore" ? null : (scenario.steps[0]?.id ?? null),
    startedAt: Date.now(),
    finishedAt: null,
    challengeOutcome: mode === "challenge" ? "active" : null,
    hintsUsed: 0,
    mistakes: 0,
    lastAction: null,
    exploredTargets: [],
    lastInspectedRef: null,
  };
}

function load(scenario: Scenario): TrainingProgress {
  if (typeof window === "undefined") return initialProgress(scenario);
  try {
    const raw = window.localStorage.getItem(storageKey(scenario.id));
    if (!raw) return initialProgress(scenario);
    const parsed = JSON.parse(raw) as Partial<TrainingProgress>;
    if (!parsed.statuses) return initialProgress(scenario);
    const mode = modeOf(scenario);
    return {
      statuses: parsed.statuses,
      activeStepId: parsed.activeStepId ?? null,
      startedAt: parsed.startedAt ?? Date.now(),
      finishedAt: parsed.finishedAt ?? null,
      challengeOutcome:
        mode === "challenge"
          ? (parsed.challengeOutcome ?? (parsed.finishedAt ? "passed" : "active"))
          : null,
      hintsUsed: parsed.hintsUsed ?? 0,
      mistakes: parsed.mistakes ?? 0,
      lastAction: parsed.lastAction ?? null,
      exploredTargets: parsed.exploredTargets ?? [],
      lastInspectedRef: parsed.lastInspectedRef ?? null,
    };
  } catch {
    return initialProgress(scenario);
  }
}

function eventPayload(event: TrainingEvent): Record<string, unknown> {
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return {};
  }
  return event.payload as Record<string, unknown>;
}

function validateEvent(validation: Validation | undefined, event: TrainingEvent): ValidationResult {
  if (!validation) return { ok: true };
  if (validation.kind !== "event") return { ok: false };
  if (validation.type !== event.type) return { ok: false };

  const payload = eventPayload(event);
  for (const [key, expected] of Object.entries(validation.match ?? {})) {
    if (payload[key] !== expected) {
      return {
        ok: false,
        message: "Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis.",
      };
    }
  }
  for (const [key, expectedFragment] of Object.entries(validation.contains ?? {})) {
    const actual = payload[key];
    if (typeof actual !== "string" || !actual.includes(expectedFragment)) {
      return { ok: false, message: "Die Aktion wurde erkannt, der erwartete Inhalt fehlt noch." };
    }
  }
  return { ok: true };
}

async function validateState(
  validation: Validation | undefined,
  scenario: Scenario,
): Promise<boolean> {
  if (!validation) return false;
  if (validation.kind === "all") {
    const results = await Promise.all(validation.of.map((item) => validateState(item, scenario)));
    return results.every(Boolean);
  }
  if (validation.kind !== "state") return false;

  const adapter = getRuntimeAdapterForSelector(
    validation.selector,
    scenario.environment?.runtimeAdapterId,
    scenario.environment?.integrationRuntimeAdapterIds,
  );
  if (!adapter) return false;
  const value = await adapter.query(validation.selector);

  if (Object.prototype.hasOwnProperty.call(validation, "equals") && value !== validation.equals)
    return false;
  if (Object.prototype.hasOwnProperty.call(validation, "includes")) {
    if (Array.isArray(value)) {
      if (!value.includes(validation.includes)) return false;
    } else if (typeof value === "string") {
      if (!value.includes(String(validation.includes))) return false;
    } else {
      return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(validation, "excludes")) {
    if (Array.isArray(value)) {
      if (value.includes(validation.excludes)) return false;
    } else if (typeof value === "string") {
      if (value.includes(String(validation.excludes))) return false;
    } else {
      return false;
    }
  }
  if (validation.match) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    for (const [key, expected] of Object.entries(validation.match)) {
      if (record[key] !== expected) return false;
    }
  }
  return true;
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

  const mode = modeOf(scenario);
  const [progress, setProgress] = useState<TrainingProgress>(() => initialProgress(scenario));
  const [hydrated, setHydrated] = useState(false);
  const [feedback, setFeedback] = useState<TrainingContextValue["feedback"]>(null);
  const [helpLevel, setHelpLevel] = useState(0);
  const [challengeRemainingSeconds, setChallengeRemainingSeconds] = useState<number | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    setHydrated(false);
    setProgress(load(scenario));
    setHelpLevel(0);
    setFeedback(null);
    setChallengeRemainingSeconds(null);
    setHydrated(true);
  }, [scenario]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey(scenario.id), JSON.stringify(progress));
  }, [progress, hydrated, scenario.id]);

  useEffect(() => {
    if (!hydrated || mode !== "challenge" || scenario.timeLimitSeconds === undefined) {
      setChallengeRemainingSeconds(null);
      return;
    }
    if (progress.challengeOutcome === "timed_out") {
      setChallengeRemainingSeconds(0);
      return;
    }
    if (progress.challengeOutcome !== "active") {
      setChallengeRemainingSeconds(null);
      return;
    }

    const deadline = progress.startedAt + scenario.timeLimitSeconds * 1000;
    const updateRemaining = () => {
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) {
        setChallengeRemainingSeconds(Math.ceil(remainingMs / 1000));
        return true;
      }

      setChallengeRemainingSeconds(0);
      const challengeStep = scenario.steps[0];
      setProgress((current) => {
        if (current.challengeOutcome !== "active") return current;
        return {
          ...current,
          statuses: challengeStep
            ? { ...current.statuses, [challengeStep.id]: "VALIDATION_FAILED" }
            : current.statuses,
          activeStepId: null,
          challengeOutcome: "timed_out",
        };
      });
      setFeedback({
        kind: "error",
        message: "Zeit abgelaufen. Diese Challenge ist beendet und muss neu gestartet werden.",
      });
      return false;
    };

    if (!updateRemaining()) return;
    const timer = window.setInterval(() => {
      if (!updateRemaining()) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [hydrated, mode, progress.challengeOutcome, progress.startedAt, scenario]);

  const completeStep = useCallback(
    (stepId: string, successMessage: string) => {
      const index = scenario.steps.findIndex((step) => step.id === stepId);
      if (index < 0) return;
      const next = scenario.steps[index + 1];
      setProgress((current) => ({
        ...current,
        statuses: {
          ...current.statuses,
          [stepId]: "COMPLETED",
          ...(next ? { [next.id]: "ACTIVE" as StepStatus } : {}),
        },
        activeStepId: next ? next.id : null,
        finishedAt: next ? null : Date.now(),
      }));
      setHelpLevel(0);
      setFeedback({ kind: "success", message: successMessage });
    },
    [scenario],
  );

  useEffect(() => {
    const runtimes = getRuntimeAdapters(
      scenario.environment?.runtimeAdapterId,
      scenario.environment?.integrationRuntimeAdapterIds,
    );
    if (runtimes.length === 0) return;

    const handleEvent = async (event: TrainingEvent) => {
      const payload = eventPayload(event);
      setProgress((current) => ({ ...current, lastAction: event.type }));

      if (mode === "explore") {
        if (event.type !== "ui.element.inspected") return;
        const ref = payload["ref"];
        if (typeof ref !== "string" || !(scenario.exploreTargets ?? []).includes(ref)) return;
        setProgress((current) => {
          const exploredTargets = current.exploredTargets.includes(ref)
            ? current.exploredTargets
            : [...current.exploredTargets, ref];
          const targetCount = scenario.exploreTargets?.length ?? 0;
          return {
            ...current,
            exploredTargets,
            lastInspectedRef: ref,
            finishedAt:
              targetCount > 0 && exploredTargets.length >= targetCount
                ? (current.finishedAt ?? Date.now())
                : current.finishedAt,
          };
        });
        return;
      }

      if (mode === "challenge") {
        if (progressRef.current.challengeOutcome !== "active") return;
        if (!(await validateState(scenario.completionValidation, scenario))) return;
        const challengeStep = scenario.steps[0];
        setProgress((current) => {
          if (current.challengeOutcome !== "active") return current;
          return {
            ...current,
            statuses: challengeStep
              ? { ...current.statuses, [challengeStep.id]: "COMPLETED" }
              : current.statuses,
            activeStepId: null,
            finishedAt: current.finishedAt ?? Date.now(),
            challengeOutcome: "passed",
          };
        });
        if (challengeStep) {
          setFeedback({ kind: "success", message: challengeStep.successMessage });
        }
        return;
      }

      const current = progressRef.current;
      const stepId = current.activeStepId;
      if (!stepId) return;
      const step = scenario.steps.find((candidate) => candidate.id === stepId);
      if (!step || step.stepType === "explanation") return;

      const expectedEvent =
        step.validation?.kind === "event" ? step.validation.type : step.expectedEvent;
      if (expectedEvent && expectedEvent !== event.type) return;

      const result = step.validate
        ? step.validate(payload)
        : step.validation
          ? validateEvent(step.validation, event)
          : { ok: true };

      if (result.ok) {
        completeStep(stepId, step.successMessage);
      } else if (result.message) {
        const counts = event.type !== "file.updated";
        if (counts) {
          setProgress((currentProgress) => ({
            ...currentProgress,
            mistakes: currentProgress.mistakes + 1,
            statuses: { ...currentProgress.statuses, [stepId]: "VALIDATION_FAILED" },
          }));
        }
        setFeedback((currentFeedback) =>
          currentFeedback?.kind === "error" && currentFeedback.message === result.message
            ? currentFeedback
            : { kind: "error", message: result.message! },
        );
      }
    };

    const subscriber = (event: TrainingEvent) => {
      void handleEvent(event);
    };
    const unsubscribes = runtimes.map((runtime) => runtime.subscribe(subscriber));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [scenario, mode, completeStep]);

  useEffect(() => {
    if (feedback?.kind !== "success") return;
    const timer = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const value = useMemo<TrainingContextValue>(() => {
    const guidedCompleted = scenario.steps.filter(
      (step) => progress.statuses[step.id] === "COMPLETED",
    ).length;
    const exploreTotal = scenario.exploreTargets?.length ?? 0;
    const exploreCompleted = progress.exploredTargets.filter((ref) =>
      (scenario.exploreTargets ?? []).includes(ref),
    ).length;
    const challengeComplete = progress.challengeOutcome === "passed";
    const isChallengeFailed = progress.challengeOutcome === "timed_out";

    const completedCount =
      mode === "explore"
        ? exploreCompleted
        : mode === "challenge"
          ? challengeComplete
            ? 1
            : 0
          : guidedCompleted;
    const totalCount =
      mode === "explore"
        ? Math.max(exploreTotal, 1)
        : mode === "challenge"
          ? 1
          : Math.max(scenario.steps.length, 1);
    const isFinished =
      mode === "explore"
        ? exploreTotal > 0 && exploreCompleted >= exploreTotal
        : mode === "challenge"
          ? challengeComplete
          : guidedCompleted === scenario.steps.length;
    const activeStepIndex = progress.activeStepId
      ? scenario.steps.findIndex((step) => step.id === progress.activeStepId)
      : scenario.steps.length;
    const scoreMultiplier = modeMultiplier(mode);
    const basePoints = scenario.points ?? Math.max(scenario.steps.length * 10, 10);

    return {
      scenario,
      mode,
      progress,
      activeStepIndex,
      completedCount,
      percent: Math.round((completedCount / totalCount) * 100),
      isFinished,
      isChallengeFailed,
      isReady: hydrated,
      feedback,
      helpLevel,
      scoreMultiplier,
      earnedPoints: Math.round(basePoints * scoreMultiplier),
      challengeOutcome: progress.challengeOutcome,
      challengeRemainingSeconds,
      revealHelp: () => {
        if (mode !== "guided") return;
        setHelpLevel((level) => {
          if (level >= 3) return level;
          setProgress((current) => ({ ...current, hintsUsed: current.hintsUsed + 1 }));
          return level + 1;
        });
      },
      resetHelp: () => setHelpLevel(0),
      completeExplanationStep: () => {
        if (mode !== "guided") return;
        const stepId = progressRef.current.activeStepId;
        if (!stepId) return;
        const step = scenario.steps.find((candidate) => candidate.id === stepId);
        if (!step || step.stepType !== "explanation") return;
        completeStep(step.id, step.successMessage);
      },
      restart: () => {
        for (const runtime of getRuntimeAdapters(
          scenario.environment?.runtimeAdapterId,
          scenario.environment?.integrationRuntimeAdapterIds,
        )) {
          runtime.reset?.();
        }
        setProgress(initialProgress(scenario));
        setHelpLevel(0);
        setFeedback(null);
      },
      registerMistake: (message: string) => {
        if (mode === "explore") return;
        setProgress((current) => ({ ...current, mistakes: current.mistakes + 1 }));
        setFeedback({ kind: "error", message });
      },
    };
  }, [
    scenario,
    mode,
    progress,
    hydrated,
    feedback,
    helpLevel,
    challengeRemainingSeconds,
    completeStep,
  ]);

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
      const parsed = JSON.parse(raw) as Partial<TrainingProgress>;
      const storedMode = modeOf(scenario);
      if (storedMode === "explore") {
        const targets = scenario.exploreTargets ?? [];
        const done = (parsed.exploredTargets ?? []).filter((ref) => targets.includes(ref)).length;
        setPercent(targets.length === 0 ? 0 : Math.round((done / targets.length) * 100));
        return;
      }
      if (storedMode === "challenge") {
        const passed = parsed.challengeOutcome === "passed" || (!parsed.challengeOutcome && parsed.finishedAt);
        setPercent(passed ? 100 : 0);
        return;
      }
      const done = scenario.steps.filter(
        (step) => parsed.statuses?.[step.id] === "COMPLETED",
      ).length;
      setPercent(Math.round((done / Math.max(scenario.steps.length, 1)) * 100));
    } catch {
      setPercent(0);
    }
  }, [scenarioId]);
  return percent;
}

export const useHighlightTarget = () => {
  const { progress, scenario, helpLevel } = useTraining();
  const step = scenario.steps.find((candidate) => candidate.id === progress.activeStepId);
  return useCallback(() => ({ step, helpLevel }), [step, helpLevel])();
};
