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
  skipConsecutiveOptionalSteps,
  timeoutChallenge,
} from "@ai-train-lab/training-engine";
import type {
  ChallengeOutcome,
  EngineValidationResult,
  Scenario,
  TrainingEvent,
  TrainingMode,
  TrainingSession,
  TrainingStateKey,
  TrainingSubjectRef,
  Validation,
} from "@ai-train-lab/training-engine";
import { useAuth } from "@/auth/AuthContext";
import { createApplicationTrainingStateRepository } from "@/persistence/applicationTrainingStateRepository";
import { getScenario } from "@/scenarios";
import { getRuntimeAdapter, getRuntimeAdapterForSelector, getRuntimeAdapters } from "@/runtime";
import { TrainingStatePersistence } from "./trainingStatePersistence";

const CHALLENGE_TIMEOUT_MESSAGE =
  "Zeit abgelaufen. Diese Challenge ist beendet und muss neu gestartet werden.";
const validatorRegistry = createDefaultValidatorRegistry();

const modeOf = (scenario: Scenario): TrainingMode => scenario.mode ?? "guided";

function stateKey(scenario: Scenario, subject: TrainingSubjectRef): TrainingStateKey {
  return {
    subject,
    scenarioId: scenario.id,
    mode: modeOf(scenario),
  };
}

function createPersistence(
  scenario: Scenario,
  subject: TrainingSubjectRef,
): TrainingStatePersistence | null {
  if (typeof window === "undefined") return null;
  return new TrainingStatePersistence(
    createApplicationTrainingStateRepository(),
    stateKey(scenario, subject),
    scenario,
  );
}

function progressPercent(scenario: Scenario, progress: TrainingSession): number {
  const mode = modeOf(scenario);
  if (mode === "explore") {
    const targets = scenario.exploreTargets ?? [];
    const done = progress.exploredTargets.filter((ref) => targets.includes(ref)).length;
    return targets.length === 0 ? 0 : Math.round((done / targets.length) * 100);
  }
  if (mode === "challenge") return progress.challengeOutcome === "passed" ? 100 : 0;

  const done = scenario.steps.filter((step) => {
    const status = progress.statuses[step.id];
    return status === "COMPLETED" || status === "SKIPPED";
  }).length;
  return Math.round((done / Math.max(scenario.steps.length, 1)) * 100);
}

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

function newSession(scenario: Scenario, subject: TrainingSubjectRef): TrainingSession {
  return createTrainingSession(scenario, scenario.id, Date.now(), subject);
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

async function challengeDiagnosticMessage(
  scenario: Scenario,
  event: TrainingEvent,
): Promise<string | null> {
  for (const diagnostic of scenario.challengeDiagnostics ?? []) {
    if (diagnostic.eventTypes && !diagnostic.eventTypes.some((type) => type === event.type))
      continue;
    const result = await validateDeclarative(diagnostic.when, scenario, event);
    if (result.outcome === "pass") return diagnostic.message;
  }
  return null;
}

export function TrainingProvider({
  scenarioId,
  children,
}: {
  scenarioId: string;
  children: ReactNode;
}) {
  const auth = useAuth();
  const subject = useMemo<TrainingSubjectRef | null>(() => {
    if (!auth.session) return null;
    return {
      userId: auth.session.identity.userId,
      tenantId: auth.session.identity.tenantId,
    };
  }, [auth.session]);
  if (!subject) throw new Error("TrainingProvider requires an authenticated user identity");

  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown training scenario: ${scenarioId}`);

  const mode = modeOf(scenario);
  const persistence = useMemo(() => createPersistence(scenario, subject), [scenario, subject]);
  const [progress, setProgress] = useState<TrainingSession>(() => newSession(scenario, subject));
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
      if (!persistence || !scenarioRuntimes.some((runtime) => runtime.id === runtimeId)) return;
      void persistence.saveRuntimeSnapshot(runtimeId, snapshot).catch(() => {
        // Progress remains usable when a runtime snapshot cannot be serialized or stored.
      });
    },
    [persistence, scenarioRuntimes],
  );

  const restoreRuntimeSnapshot = useCallback(
    async (runtimeId: string) => {
      const runtime = getRuntimeAdapter(runtimeId);
      if (!runtime || !persistence || !scenarioRuntimes.includes(runtime)) return false;

      try {
        const snapshot = await persistence.loadRuntimeSnapshot(runtimeId);
        if (snapshot !== null) {
          await runtime.restore(snapshot);
          return true;
        }
      } catch {
        // A missing or incompatible snapshot falls back to a consistent fresh session below.
      }

      let persistedProgress = progressRef.current;
      try {
        persistedProgress = (await persistence.loadSession()).session;
      } catch {
        // The in-memory session remains the fallback when persistence is temporarily unavailable.
      }

      const hasStarted =
        persistedProgress.finishedAt === null &&
        (persistedProgress.lastAction !== null ||
          Object.values(persistedProgress.statuses).some(
            (status) => status === "COMPLETED" || status === "VALIDATION_FAILED",
          ));
      if (mode !== "explore" && hasStarted) {
        const freshProgress = newSession(scenario, subject);
        setProgress(freshProgress);
        setVisibleHelpLevel(0);
        setFeedback(null);
      }
      return false;
    },
    [mode, persistence, scenario, scenarioRuntimes, subject],
  );

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);

    if (!persistence) return () => undefined;

    void persistence
      .loadSession()
      .then(({ session }) => {
        if (cancelled) return;
        setProgress(session);
        setVisibleHelpLevel(activeHelpLevel(session));
        setFeedback(null);
        setChallengeRemainingSeconds(null);
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        const freshProgress = newSession(scenario, subject);
        setProgress(freshProgress);
        setVisibleHelpLevel(0);
        setFeedback(null);
        setChallengeRemainingSeconds(null);
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [persistence, scenario, subject]);

  useEffect(() => {
    if (!hydrated || !persistence) return;
    let cancelled = false;

    void persistence
      .saveSession(progress)
      .then((authoritativeSession) => {
        if (cancelled || !authoritativeSession) return;
        setProgress((current) => {
          if (current !== progress) return current;
          setVisibleHelpLevel(activeHelpLevel(authoritativeSession));
          setFeedback(null);
          return authoritativeSession;
        });
      })
      .catch(() => {
        // The current session stays usable when persistence is temporarily unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [progress, hydrated, persistence]);

  useEffect(() => {
    if (!hydrated || !persistence) return;
    let cancelled = false;

    const handleOnline = () => {
      void persistence
        .synchronizeAfterReconnect(scenarioRuntimes.map((runtime) => runtime.id))
        .then(async ({ session, runtimeRestores }) => {
          if (cancelled) return;

          if (session) {
            setProgress(session);
            setVisibleHelpLevel(activeHelpLevel(session));
            setFeedback(null);
          }

          for (const restore of runtimeRestores) {
            if (cancelled) return;
            const runtime = scenarioRuntimes.find(
              (candidate) => candidate.id === restore.runtimeId,
            );
            if (!runtime) continue;

            try {
              if (restore.snapshot === null) {
                if (!runtime.reset) continue;
                runtime.reset();
              } else {
                await runtime.restore(restore.snapshot);
              }
              persistence.markRuntimeSnapshotRestored(restore.runtimeId);
            } catch {
              // Keep writes blocked until a later successful restore of the server-authoritative state.
            }
          }
        })
        .catch(() => {
          // The browser may report online before the remote persistence endpoint is reachable.
        });
    };

    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [hydrated, persistence, scenarioRuntimes]);

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
        if (result.outcome !== "pass") {
          const message = await challengeDiagnosticMessage(scenario, event);
          const currentProgress = progressRef.current;
          if (
            currentProgress.challengeOutcome === "active" &&
            currentProgress.startedAt === challengeStartedAt
          ) {
            setFeedback(message ? { kind: "error", message } : null);
          }
          return;
        }

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

        setFeedback(null);
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
          if (persistence) {
            void persistence.deleteRuntimeSnapshot(runtime.id).catch(() => undefined);
          }
          runtime.reset?.();
        }
        setProgress(newSession(scenario, subject));
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
    subject,
    persistence,
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

/** Read-only progress for one dashboard training (no training provider needed). */
export function useStoredProgressPercent(scenarioId: string | null) {
  const auth = useAuth();
  const subject = useMemo<TrainingSubjectRef | null>(() => {
    if (!auth.session) return null;
    return {
      userId: auth.session.identity.userId,
      tenantId: auth.session.identity.tenantId,
    };
  }, [auth.session]);
  const scenario = scenarioId ? getScenario(scenarioId) : undefined;
  const persistence = useMemo(
    () => (scenario && subject ? createPersistence(scenario, subject) : null),
    [scenario, subject],
  );
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!scenario || !persistence) {
      setPercent(0);
      return () => undefined;
    }

    void persistence
      .loadSession()
      .then(({ session }) => {
        if (!cancelled) setPercent(progressPercent(scenario, session));
      })
      .catch(() => {
        if (!cancelled) setPercent(0);
      });

    return () => {
      cancelled = true;
    };
  }, [scenario, persistence]);
  return percent;
}

export const useHighlightTarget = () => {
  const { progress, scenario, helpLevel } = useTraining();
  const step = scenario.steps.find((candidate) => candidate.id === progress.activeStepId);
  return useCallback(() => ({ step, helpLevel }), [step, helpLevel])();
};