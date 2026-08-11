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
import {
  activeHelpLevel,
  applyValidationResult,
  challengeDeadlineAt,
  completeChallenge,
  completeTrainingStep,
  createDefaultValidatorRegistry,
  createTrainingSession,
  inspectExploreTarget,
  isChallengeDeadlineExpired,
  normalizeLegacyValidationResult,
  recordHintUsage,
  recordLastAction,
  recordMistake,
  restoreTrainingSession,
  skipConsecutiveOptionalSteps,
  timeoutChallenge,
} from "@ai-train-lab/training-engine";
import type {
  ChallengeOutcome,
  EngineValidationResult,
  Scenario,
  StoredTrainingSession,
  TrainingEvent,
  TrainingMode,
  TrainingSession,
  Validation,
} from "@ai-train-lab/training-engine";
import { getScenario } from "@/scenarios";
import { getRuntimeAdapter, getRuntimeAdapterForSelector, getRuntimeAdapters } from "@/runtime";

const storageKey = (scenarioId: string) => `ai-training-lab:${scenarioId}:v2`;
const runtimeStorageKey = (scenarioId: string, runtimeId: string) =>
  `ai-training-lab:${scenarioId}:runtime:${runtimeId}:v1`;
const CHALLENGE_TIMEOUT_MESSAGE =
  "Zeit abgelaufen. Diese Challenge ist beendet und muss neu gestartet werden.";
const validatorRegistry = createDefaultValidatorRegistry();

const modeOf = (scenario: Scenario): TrainingMode => scenario.mode ?? "guided";
const modeMultiplier = (mode: TrainingMode) =>
  mode === "explore" ? 0.5 : mode === "challenge" ? 2 : 1;

/** Backwards-compatible UI name; the authoritative state lives in training-engine. */
export type TrainingProgress = TrainingSession;

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
  skipOptionalSteps: () => void;
  restart: () => void;
  registerMistake: (message: string) => void;
  persistRuntimeSnapshot: (runtimeId: string, snapshot: unknown) => void;
  restoreRuntimeSnapshot: (runtimeId: string) => Promise<boolean>;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);

function newSession(scenario: Scenario): TrainingSession {
  return createTrainingSession(scenario, scenario.id);
}

function load(scenario: Scenario): TrainingSession {
  if (typeof window === "undefined") return newSession(scenario);
  try {
    const raw = window.localStorage.getItem(storageKey(scenario.id));
    if (!raw) return newSession(scenario);
    return restoreTrainingSession(
      scenario,
      scenario.id,
      JSON.parse(raw) as StoredTrainingSession,
    );
  } catch {
    return newSession(scenario);
  }
}

function eventPayload(event: TrainingEvent): Record<string, unknown> {
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return {};
  }
  return event.payload as Record<string, unknown>;
}

function queryScenarioState(scenario: Scenario, selector: string): Promise<unknown> {
  const adapter = getRuntimeAdapterForSelector(
    selector,
    scenario.environment?.runtimeAdapterId,
    scenario.environment?.integrationRuntimeAdapterIds,
  );
  return adapter ? adapter.query(selector) : Promise.resolve(undefined);
}

function validateDeclarative(
  validation: Validation,
  scenario: Scenario,
  event?: TrainingEvent,
): Promise<EngineValidationResult> {
  return validatorRegistry.validate(validation, {
    ...(event ? { event } : {}),
    query: (selector) => queryScenarioState(scenario, selector),
  });
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
  const [progress, setProgress] = useState<TrainingSession>(() => newSession(scenario));
  const [hydrated, setHydrated] = useState(false);
  const [feedback, setFeedback] = useState<TrainingContextValue["feedback"]>(null);
  const [visibleHelpLevel, setVisibleHelpLevel] = useState(0);
  const [challengeRemainingSeconds, setChallengeRemainingSeconds] = useState<number | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const scenarioRuntimes = useMemo(
    () =>
      getRuntimeAdapters(
        scenario.environment?.runtimeAdapterId,
        scenario.environment?.integrationRuntimeAdapterIds,
      ),
    [scenario],
  );

  const persistRuntimeSnapshot = useCallback(
    (runtimeId: string, snapshot: unknown) => {
      if (!scenarioRuntimes.some((runtime) => runtime.id === runtimeId)) return;
      try {
        window.localStorage.setItem(
          runtimeStorageKey(scenario.id, runtimeId),
          JSON.stringify(snapshot),
        );
      } catch {
        // Progress remains usable when a runtime snapshot cannot be serialized or stored.
      }
    },
    [scenario.id, scenarioRuntimes],
  );

  const restoreRuntimeSnapshot = useCallback(
    async (runtimeId: string) => {
      const runtime = getRuntimeAdapter(runtimeId);
      if (!runtime || !scenarioRuntimes.includes(runtime)) return false;

      try {
        const raw = window.localStorage.getItem(runtimeStorageKey(scenario.id, runtimeId));
        if (raw) {
          await runtime.restore(JSON.parse(raw));
          return true;
        }
      } catch {
        // A missing or incompatible snapshot falls back to a consistent fresh session below.
      }

      const persistedProgress = load(scenario);
      const hasStarted =
        persistedProgress.finishedAt === null &&
        (persistedProgress.lastAction !== null ||
          Object.values(persistedProgress.statuses).some(
            (status) => status === "COMPLETED" || status === "VALIDATION_FAILED",
          ));
      if (mode !== "explore" && hasStarted) {
        const freshProgress = newSession(scenario);
        window.localStorage.setItem(storageKey(scenario.id), JSON.stringify(freshProgress));
        setProgress(freshProgress);
        setVisibleHelpLevel(0);
        setFeedback(null);
      }
      return false;
    },
    [mode, scenario, scenarioRuntimes],
  );

  useEffect(() => {
    setHydrated(false);
    const persistedProgress = load(scenario);
    setProgress(persistedProgress);
    setVisibleHelpLevel(activeHelpLevel(persistedProgress));
    setFeedback(null);
    setChallengeRemainingSeconds(null);
    setHydrated(true);
  }, [scenario]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey(scenario.id), JSON.stringify(progress));
  }, [progress, hydrated, scenario.id]);

  const markChallengeTimedOut = useCallback(() => {
    setProgress((current) => timeoutChallenge(current, scenario));
  }, [scenario]);

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

    const deadline = challengeDeadlineAt(scenario, progress);
    if (deadline === null) return;
    const updateRemaining = () => {
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) {
        setChallengeRemainingSeconds(Math.ceil(remainingMs / 1000));
        return true;
      }

      markChallengeTimedOut();
      return false;
    };

    if (!updateRemaining()) return;
    const timer = window.setInterval(() => {
      if (!updateRemaining()) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [
    hydrated,
    mode,
    progress.challengeOutcome,
    progress.startedAt,
    scenario,
    markChallengeTimedOut,
  ]);

  const completeStep = useCallback(
    (stepId: string, successMessage: string) => {
      setProgress((current) => completeTrainingStep(current, scenario, stepId));
      setVisibleHelpLevel(0);
      setFeedback({ kind: "success", message: successMessage });
    },
    [scenario],
  );

  useEffect(() => {
    if (scenarioRuntimes.length === 0) return;

    const handleEvent = async (event: TrainingEvent) => {
      const payload = eventPayload(event);
      setProgress((current) => recordLastAction(current, event.type));

      if (mode === "explore") {
        if (event.type !== "ui.element.inspected") return;
        const ref = payload["ref"];
        if (typeof ref !== "string") return;
        setProgress((current) => inspectExploreTarget(current, scenario, ref));
        return;
      }

      if (mode === "challenge") {
        const startedProgress = progressRef.current;
        if (startedProgress.challengeOutcome !== "active") return;
        if (isChallengeDeadlineExpired(scenario, startedProgress)) {
          markChallengeTimedOut();
          return;
        }
        if (!scenario.completionValidation) return;

        const challengeStartedAt = startedProgress.startedAt;
        const result = await validateDeclarative(scenario.completionValidation, scenario, event);
        if (result.outcome !== "pass") return;

        const currentProgress = progressRef.current;
        if (
          currentProgress.challengeOutcome !== "active" ||
          currentProgress.startedAt !== challengeStartedAt
        ) {
          return;
        }
        const completedAt = Date.now();
        if (isChallengeDeadlineExpired(scenario, currentProgress, completedAt)) {
          markChallengeTimedOut();
          return;
        }

        setProgress((current) => {
          if (
            current.challengeOutcome !== "active" ||
            current.startedAt !== challengeStartedAt ||
            isChallengeDeadlineExpired(scenario, current, completedAt)
          ) {
            return current;
          }
          return completeChallenge(current, scenario, completedAt);
        });
        return;
      }

      const current = progressRef.current;
      const stepId = current.activeStepId;
      if (!stepId) return;
      const step = scenario.steps.find((candidate) => candidate.id === stepId);
      if (!step || step.stepType === "explanation") return;
      if (step.expectedEvent && step.expectedEvent !== event.type) return;

      let result: EngineValidationResult;
      if (step.validate) {
        result = normalizeLegacyValidationResult(step.validate(payload));
      } else if (step.validation) {
        result = await validateDeclarative(step.validation, scenario, event);
      } else {
        result = { outcome: "pass" };
      }

      if (result.outcome === "ignore") return;

      const now = Date.now();
      setProgress((currentProgress) =>
        applyValidationResult(currentProgress, scenario, stepId, result, now, {
          countNearMiss: event.type !== "file.updated",
        }),
      );

      if (result.outcome === "pass") {
        setVisibleHelpLevel(0);
        setFeedback({ kind: "success", message: step.successMessage });
        return;
      }

      const message =
        step.onFailure?.message ??
        result.message ??
        "Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis.";
      setFeedback((currentFeedback) =>
        currentFeedback?.kind === "error" && currentFeedback.message === message
          ? currentFeedback
          : { kind: "error", message },
      );
    };

    const subscriber = (event: TrainingEvent) => {
      void handleEvent(event);
    };
    const unsubscribes = scenarioRuntimes.map((runtime) => runtime.subscribe(subscriber));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [scenario, scenarioRuntimes, mode, markChallengeTimedOut]);

  useEffect(() => {
    if (feedback?.kind !== "success") return;
    const timer = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const value = useMemo<TrainingContextValue>(() => {
    const guidedCompleted = scenario.steps.filter((step) => {
      const status = progress.statuses[step.id];
      return status === "COMPLETED" || status === "SKIPPED";
    }).length;
    const exploreTotal = scenario.exploreTargets?.length ?? 0;
    const exploreCompleted = progress.exploredTargets.filter((ref) =>
      (scenario.exploreTargets ?? []).includes(ref),
    ).length;
    const challengeComplete = progress.challengeOutcome === "passed";
    const isChallengeFailed = progress.challengeOutcome === "timed_out";
    const effectiveFeedback = isChallengeFailed
      ? ({ kind: "error", message: CHALLENGE_TIMEOUT_MESSAGE } as const)
      : feedback;

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
      feedback: effectiveFeedback,
      helpLevel: visibleHelpLevel,
      scoreMultiplier,
      earnedPoints: Math.round(basePoints * scoreMultiplier),
      challengeOutcome: progress.challengeOutcome,
      challengeRemainingSeconds: isChallengeFailed ? 0 : challengeRemainingSeconds,
      revealHelp: () => {
        if (mode !== "guided" || visibleHelpLevel >= 3) return;
        const stepId = progressRef.current.activeStepId;
        if (!stepId) return;
        const nextLevel = (visibleHelpLevel + 1) as 1 | 2 | 3;
        setProgress((current) => recordHintUsage(current, stepId, nextLevel));
        setVisibleHelpLevel(nextLevel);
      },
      resetHelp: () => setVisibleHelpLevel(0),
      completeExplanationStep: () => {
        if (mode !== "guided") return;
        const stepId = progressRef.current.activeStepId;
        if (!stepId) return;
        const step = scenario.steps.find((candidate) => candidate.id === stepId);
        if (!step || step.stepType !== "explanation") return;
        completeStep(step.id, step.successMessage);
      },
      skipOptionalSteps: () => {
        if (mode !== "guided") return;
        const current = progressRef.current;
        const step = scenario.steps.find((candidate) => candidate.id === current.activeStepId);
        if (!step?.optional) return;
        setProgress((session) => skipConsecutiveOptionalSteps(session, scenario));
        setVisibleHelpLevel(0);
        setFeedback({
          kind: "success",
          message: "Grundbegriffe übersprungen. Du kannst sie jederzeit über das Glossar öffnen.",
        });
      },
      restart: () => {
        for (const runtime of scenarioRuntimes) {
          window.localStorage.removeItem(runtimeStorageKey(scenario.id, runtime.id));
          runtime.reset?.();
        }
        setProgress(newSession(scenario));
        setVisibleHelpLevel(0);
        setFeedback(null);
      },
      registerMistake: (message: string) => {
        setProgress((current) => recordMistake(current));
        if (mode !== "explore") setFeedback({ kind: "error", message });
      },
      persistRuntimeSnapshot,
      restoreRuntimeSnapshot,
    };
  }, [
    scenario,
    mode,
    progress,
    hydrated,
    feedback,
    visibleHelpLevel,
    challengeRemainingSeconds,
    completeStep,
    scenarioRuntimes,
    persistRuntimeSnapshot,
    restoreRuntimeSnapshot,
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
      const stored = restoreTrainingSession(
        scenario,
        scenario.id,
        JSON.parse(raw) as StoredTrainingSession,
      );
      const storedMode = modeOf(scenario);
      if (storedMode === "explore") {
        const targets = scenario.exploreTargets ?? [];
        const done = stored.exploredTargets.filter((ref) => targets.includes(ref)).length;
        setPercent(targets.length === 0 ? 0 : Math.round((done / targets.length) * 100));
        return;
      }
      if (storedMode === "challenge") {
        setPercent(stored.challengeOutcome === "passed" ? 100 : 0);
        return;
      }
      const done = scenario.steps.filter((step) => {
        const status = stored.statuses[step.id];
        return status === "COMPLETED" || status === "SKIPPED";
      }).length;
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
