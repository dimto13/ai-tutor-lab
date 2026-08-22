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
  canNavigateToGuidedStep,
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
  resumeGuidedStepAfterRecovery,
  skipConsecutiveOptionalSteps,
  timeoutChallenge,
} from "@ai-train-lab/training-engine";
import type {
  ChallengeOutcome,
  EngineValidationResult,
  GuidedRecoveryAction,
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
import {
  loadChallengeAttemptHistory,
  recordTimedOutChallengeAttempt,
  shouldRecommendGuidedAfterChallenge,
} from "./challengeAttemptHistory";
import { GuidedNavigationCoordinator } from "./guidedNavigationCoordinator";
import { TrainingStatePersistence } from "./trainingStatePersistence";

const CHALLENGE_TIMEOUT_MESSAGE =
  "Zeit abgelaufen. Diese Challenge ist beendet und muss neu gestartet werden.";
const GUIDED_RECOVERY_CHECKPOINT_VERSION = 1 as const;
const validatorRegistry = createDefaultValidatorRegistry();

interface GuidedRecoveryCheckpoint {
  version: typeof GUIDED_RECOVERY_CHECKPOINT_VERSION;
  stepId: string;
  snapshot: unknown;
}

interface ActiveGuidedRecovery {
  stepId: string;
  action: GuidedRecoveryAction;
}

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

function guidedRecoveryCheckpointRuntimeId(runtimeId: string): string {
  return `${runtimeId}::guided-recovery-checkpoint`;
}

function parseGuidedRecoveryCheckpoint(value: unknown): GuidedRecoveryCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<GuidedRecoveryCheckpoint>;
  if (
    candidate.version !== GUIDED_RECOVERY_CHECKPOINT_VERSION ||
    typeof candidate.stepId !== "string" ||
    !Object.prototype.hasOwnProperty.call(candidate, "snapshot")
  ) {
    return null;
  }
  return {
    version: GUIDED_RECOVERY_CHECKPOINT_VERSION,
    stepId: candidate.stepId,
    snapshot: candidate.snapshot,
  };
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
  recommendGuidedAfterChallenge: boolean;
  isReady: boolean;
  isGuidedReplay: boolean;
  guidedNavigationPending: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  helpLevel: number;
  challengeOutcome: ChallengeOutcome | null;
  challengeRemainingSeconds: number | null;
  recovery: GuidedRecoveryAction | null;
  revealHelp: () => void;
  resetHelp: () => void;
  completeExplanationStep: () => void;
  skipOptionalSteps: () => void;
  restart: () => void;
  registerMistake: (message: string) => void;
  navigateToGuidedStep: (stepId: string) => Promise<void>;
  performGuidedRecovery: () => Promise<void>;
  ensureGuidedNavigationCheckpoints: () => Promise<void>;
  ensureGuidedRecoveryCheckpoint: (runtimeId: string, snapshot: unknown) => Promise<void>;
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
  const [recommendGuidedAfterChallenge, setRecommendGuidedAfterChallenge] = useState(false);
  const [stateRecovery, setStateRecovery] = useState<ActiveGuidedRecovery | null>(null);
  const [guidedReplayStepId, setGuidedReplayStepId] = useState<string | null>(null);
  const [guidedNavigationPending, setGuidedNavigationPending] = useState(false);
  const progressRef = useRef(progress);
  const guidedReplayStepIdRef = useRef<string | null>(guidedReplayStepId);
  const guidedNavigationBusyRef = useRef(false);
  progressRef.current = progress;
  guidedReplayStepIdRef.current = guidedReplayStepId;

  const scenarioRuntimes = useMemo(
    () =>
      getRuntimeAdapters(
        scenario.environment?.runtimeAdapterId,
        scenario.environment?.integrationRuntimeAdapterIds,
      ),
    [scenario],
  );
  const guidedNavigationCoordinator = useMemo(
    () => (persistence ? new GuidedNavigationCoordinator(persistence, scenarioRuntimes) : null),
    [persistence, scenarioRuntimes],
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
        guidedReplayStepIdRef.current = null;
        setGuidedReplayStepId(null);
        setProgress(freshProgress);
        setVisibleHelpLevel(0);
        setFeedback(null);
        setStateRecovery(null);
      }
      return false;
    },
    [mode, persistence, scenario, scenarioRuntimes, subject],
  );

  const ensureGuidedNavigationCheckpoints = useCallback(async () => {
    if (mode !== "guided" || !guidedNavigationCoordinator || guidedReplayStepIdRef.current) return;
    const stepId = progressRef.current.activeStepId;
    if (!stepId) return;
    try {
      await guidedNavigationCoordinator.ensureStepEntryCheckpoints(stepId);
    } catch {
      // Navigation stays unavailable for this step until a deterministic checkpoint can be saved.
    }
  }, [guidedNavigationCoordinator, mode]);

  const ensureGuidedRecoveryCheckpoint = useCallback(
    async (runtimeId: string, snapshot: unknown) => {
      if (mode !== "guided" || !persistence || guidedReplayStepIdRef.current) return;
      if (!scenarioRuntimes.some((runtime) => runtime.id === runtimeId)) return;

      const stepId = progressRef.current.activeStepId;
      if (!stepId) return;
      const step = scenario.steps.find((candidate) => candidate.id === stepId);
      if (!step?.recovery) return;

      const checkpointId = guidedRecoveryCheckpointRuntimeId(runtimeId);
      try {
        const existing = parseGuidedRecoveryCheckpoint(
          await persistence.loadRuntimeSnapshot(checkpointId),
        );
        if (existing?.stepId === stepId) return;
        await persistence.saveRuntimeSnapshot(checkpointId, {
          version: GUIDED_RECOVERY_CHECKPOINT_VERSION,
          stepId,
          snapshot,
        } satisfies GuidedRecoveryCheckpoint);
      } catch {
        // The active training remains usable; recovery UI is only offered when its checkpoint works.
      }
    },
    [mode, persistence, scenario, scenarioRuntimes],
  );

  const evaluateGuidedRecoveryStateRules = useCallback(async () => {
    if (mode !== "guided" || guidedReplayStepIdRef.current) {
      setStateRecovery(null);
      return;
    }

    const current = progressRef.current;
    const stepId = current.activeStepId;
    const step = scenario.steps.find((candidate) => candidate.id === stepId);
    if (!stepId || !step?.recovery?.stateRules?.length) {
      setStateRecovery(null);
      return;
    }

    for (const rule of step.recovery.stateRules) {
      const result = await validateDeclarative(rule.when, scenario);
      if (progressRef.current.activeStepId !== stepId || guidedReplayStepIdRef.current) return;
      if (result.outcome === "pass") {
        setStateRecovery({ stepId, action: rule.action });
        return;
      }
    }

    setStateRecovery((currentRecovery) =>
      currentRecovery?.stepId === stepId ? null : currentRecovery,
    );
  }, [mode, scenario]);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);

    if (!persistence) return () => undefined;

    void persistence
      .loadSession()
      .then(async ({ session }) => {
        let shouldRecommendGuided = false;
        if (mode === "challenge") {
          try {
            shouldRecommendGuided = shouldRecommendGuidedAfterChallenge(
              await loadChallengeAttemptHistory(persistence),
            );
          } catch {
            // Challenge remains usable when recommendation history cannot be restored.
          }
        }
        const replayStepId =
          mode === "guided" && guidedNavigationCoordinator
            ? await guidedNavigationCoordinator.loadReplayStepId(session, scenario)
            : null;
        if (cancelled) return;
        guidedReplayStepIdRef.current = replayStepId;
        setGuidedReplayStepId(replayStepId);
        setProgress(session);
        setVisibleHelpLevel(replayStepId ? 0 : activeHelpLevel(session));
        setFeedback(null);
        setStateRecovery(null);
        setChallengeRemainingSeconds(null);
        setRecommendGuidedAfterChallenge(shouldRecommendGuided);
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        const freshProgress = newSession(scenario, subject);
        guidedReplayStepIdRef.current = null;
        setGuidedReplayStepId(null);
        setProgress(freshProgress);
        setVisibleHelpLevel(0);
        setFeedback(null);
        setStateRecovery(null);
        setChallengeRemainingSeconds(null);
        setRecommendGuidedAfterChallenge(false);
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [persistence, scenario, subject, mode, guidedNavigationCoordinator]);

  useEffect(() => {
    if (!hydrated || !persistence) return;
    let cancelled = false;

    void persistence
      .saveSession(progress)
      .then((authoritativeSession) => {
        if (cancelled || !authoritativeSession) return;
        setProgress((current) => {
          if (current !== progress) return current;
          if (!guidedReplayStepIdRef.current) {
            setVisibleHelpLevel(activeHelpLevel(authoritativeSession));
          }
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
    if (
      !hydrated ||
      mode !== "challenge" ||
      !persistence ||
      progress.challengeOutcome !== "timed_out"
    ) {
      return;
    }
    let cancelled = false;

    void recordTimedOutChallengeAttempt(persistence, progress)
      .then((history) => {
        if (!cancelled) {
          setRecommendGuidedAfterChallenge(shouldRecommendGuidedAfterChallenge(history));
        }
      })
      .catch(() => {
        // Persisted session remains authoritative even if recommendation history is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, mode, persistence, progress]);

  useEffect(() => {
    if (!hydrated || mode !== "guided") return;
    const unsubscribes = scenarioRuntimes.flatMap((runtime) => {
      if (!runtime.subscribeStateChange) return [];
      return [
        runtime.subscribeStateChange(({ reason }) => {
          if (reason === "mount" || guidedReplayStepIdRef.current) return;
          void evaluateGuidedRecoveryStateRules();
        }),
      ];
    });
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [hydrated, mode, scenarioRuntimes, evaluateGuidedRecoveryStateRules]);

  useEffect(() => {
    if (!hydrated || mode !== "guided") return;
    if (guidedReplayStepId) {
      setStateRecovery(null);
      return;
    }
    setStateRecovery((current) => (current?.stepId === progress.activeStepId ? current : null));
    const frame = window.requestAnimationFrame(() => {
      void evaluateGuidedRecoveryStateRules();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, mode, progress.activeStepId, guidedReplayStepId, evaluateGuidedRecoveryStateRules]);

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
            if (!guidedReplayStepIdRef.current) setVisibleHelpLevel(activeHelpLevel(session));
            setFeedback(null);
            setStateRecovery(null);
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
          if (!cancelled && !guidedReplayStepIdRef.current) {
            void evaluateGuidedRecoveryStateRules();
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
  }, [hydrated, persistence, scenarioRuntimes, evaluateGuidedRecoveryStateRules]);

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
      setStateRecovery(null);
    },
    [scenario],
  );

  const finishGuidedReplay = useCallback(
    async (successMessage?: string) => {
      if (
        mode !== "guided" ||
        !guidedNavigationCoordinator ||
        !guidedReplayStepIdRef.current ||
        guidedNavigationBusyRef.current
      ) {
        return;
      }
      const returnStepId = progressRef.current.activeStepId;
      if (!returnStepId) return;

      guidedNavigationBusyRef.current = true;
      setGuidedNavigationPending(true);
      try {
        await guidedNavigationCoordinator.returnToFurthest(returnStepId);
        guidedReplayStepIdRef.current = null;
        setGuidedReplayStepId(null);
        setVisibleHelpLevel(activeHelpLevel(progressRef.current));
        setStateRecovery(null);
        setFeedback({
          kind: "success",
          message: successMessage
            ? `${successMessage} Wiederholung abgeschlossen – dein bisheriger Fortschritt bleibt erhalten.`
            : "Wiederholung beendet – du bist wieder bei deinem aktuellen Fortschritt.",
        });
        void evaluateGuidedRecoveryStateRules();
      } catch {
        setFeedback({
          kind: "error",
          message:
            "Der aktuelle Fortschrittszustand konnte nicht wiederhergestellt werden. Versuche die Rückkehr bitte erneut.",
        });
      } finally {
        guidedNavigationBusyRef.current = false;
        setGuidedNavigationPending(false);
      }
    },
    [mode, guidedNavigationCoordinator, evaluateGuidedRecoveryStateRules],
  );

  const navigateToGuidedStep = useCallback(
    async (targetStepId: string) => {
      if (mode !== "guided" || !guidedNavigationCoordinator || guidedNavigationBusyRef.current) {
        return;
      }

      const current = progressRef.current;
      if (!canNavigateToGuidedStep(current, scenario, targetStepId)) return;

      if (targetStepId === current.activeStepId) {
        if (guidedReplayStepIdRef.current) await finishGuidedReplay();
        return;
      }
      if (current.statuses[targetStepId] !== "COMPLETED") return;

      guidedNavigationBusyRef.current = true;
      setGuidedNavigationPending(true);
      try {
        if (guidedReplayStepIdRef.current) {
          await guidedNavigationCoordinator.switchReplay(targetStepId);
        } else {
          const returnStepId = current.activeStepId;
          if (!returnStepId) return;
          await guidedNavigationCoordinator.enterReplay(targetStepId, returnStepId);
        }
        guidedReplayStepIdRef.current = targetStepId;
        setGuidedReplayStepId(targetStepId);
        setVisibleHelpLevel(0);
        setStateRecovery(null);
        setFeedback(null);
      } catch {
        setFeedback({
          kind: "error",
          message:
            "Dieser Schritt konnte nicht in seinem damaligen Arbeitszustand geöffnet werden. Dein aktueller Fortschritt wurde nicht verändert.",
        });
      } finally {
        guidedNavigationBusyRef.current = false;
        setGuidedNavigationPending(false);
      }
    },
    [mode, guidedNavigationCoordinator, scenario, finishGuidedReplay],
  );

  const performGuidedRecovery = useCallback(async () => {
    if (mode !== "guided" || !persistence || guidedReplayStepIdRef.current) return;
    const current = progressRef.current;
    const stepId = current.activeStepId;
    if (!stepId) return;
    const step = scenario.steps.find((candidate) => candidate.id === stepId);
    if (!step) return;

    const validationFailureRecovery =
      current.statuses[stepId] === "VALIDATION_FAILED"
        ? step.recovery?.onValidationFailure
        : undefined;
    const action =
      stateRecovery?.stepId === stepId ? stateRecovery.action : validationFailureRecovery;
    if (!action) return;

    const recoveryStillTargetsStep = () => {
      const latest = progressRef.current;
      return (
        latest.finishedAt === null &&
        latest.activeStepId === stepId &&
        !guidedReplayStepIdRef.current
      );
    };

    try {
      if (action.strategy === "runtime_repair") {
        const runtimeId = action.runtimeAdapterId ?? scenario.environment?.runtimeAdapterId;
        const runtime = getRuntimeAdapter(runtimeId);
        if (!runtime?.recover || !action.command) throw new Error("Recovery command unsupported");
        const result = await runtime.recover(action.command);
        if (!recoveryStillTargetsStep()) return;
        if (result.status !== "repaired") throw new Error("Recovery command unsupported");
        const snapshot = await runtime.snapshot();
        if (!recoveryStillTargetsStep()) return;
        await persistence.saveRuntimeSnapshot(runtime.id, snapshot);
        if (!recoveryStillTargetsStep()) return;
      } else {
        for (const runtime of scenarioRuntimes) {
          const checkpoint = parseGuidedRecoveryCheckpoint(
            await persistence.loadRuntimeSnapshot(guidedRecoveryCheckpointRuntimeId(runtime.id)),
          );
          if (!recoveryStillTargetsStep()) return;
          if (!checkpoint || checkpoint.stepId !== stepId) {
            throw new Error("Recovery checkpoint unavailable");
          }
          await runtime.restore(checkpoint.snapshot);
          if (!recoveryStillTargetsStep()) return;
          await persistence.saveRuntimeSnapshot(runtime.id, checkpoint.snapshot);
          if (!recoveryStillTargetsStep()) return;
        }
      }

      if (!recoveryStillTargetsStep()) return;
      setProgress((session) => resumeGuidedStepAfterRecovery(session, stepId));
      setStateRecovery(null);
      setVisibleHelpLevel(activeHelpLevel(progressRef.current));
      setFeedback({
        kind: "success",
        message:
          "Der Schritt ist wieder in einem passenden Arbeitszustand. Du kannst hier weitermachen.",
      });
      void evaluateGuidedRecoveryStateRules();
    } catch {
      if (!recoveryStillTargetsStep()) return;
      setFeedback({
        kind: "error",
        message:
          "Der Schritt konnte nicht automatisch wiederhergestellt werden. Versuche die Wiederherstellung bitte erneut.",
      });
    }
  }, [
    mode,
    persistence,
    scenario,
    scenarioRuntimes,
    stateRecovery,
    evaluateGuidedRecoveryStateRules,
  ]);

  useEffect(() => {
    if (scenarioRuntimes.length === 0) return;

    const handleEvent = async (event: TrainingEvent) => {
      const payload = eventPayload(event);
      const replayStepAtStart = guidedReplayStepIdRef.current;
      if (!replayStepAtStart) {
        setProgress((current) => recordLastAction(current, event.type));
      }

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
      const stepId = replayStepAtStart ?? current.activeStepId;
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

      if (guidedReplayStepIdRef.current !== replayStepAtStart) return;
      if (result.outcome === "ignore") return;

      if (replayStepAtStart) {
        if (result.outcome === "pass") {
          await finishGuidedReplay(step.successMessage);
          return;
        }
        const message =
          step.onFailure?.message ??
          result.message ??
          "Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis.";
        setFeedback({ kind: "error", message });
        return;
      }

      const now = Date.now();
      setProgress((currentProgress) =>
        applyValidationResult(currentProgress, scenario, stepId, result, now, {
          countNearMiss: event.type !== "file.updated",
        }),
      );

      if (result.outcome === "pass") {
        setVisibleHelpLevel(0);
        setStateRecovery(null);
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
  }, [scenario, scenarioRuntimes, mode, markChallengeTimedOut, finishGuidedReplay]);

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
    const visibleProgress = guidedReplayStepId
      ? ({
          ...progress,
          activeStepId: guidedReplayStepId,
          activeStepMistakes: 0,
        } satisfies TrainingSession)
      : progress;
    const activeStepIndex = visibleProgress.activeStepId
      ? scenario.steps.findIndex((step) => step.id === visibleProgress.activeStepId)
      : scenario.steps.length;
    const activeStep = scenario.steps.find((step) => step.id === progress.activeStepId);
    const validationRecovery =
      activeStep && progress.statuses[activeStep.id] === "VALIDATION_FAILED"
        ? (activeStep.recovery?.onValidationFailure ?? null)
        : null;
    const recovery = guidedReplayStepId
      ? null
      : stateRecovery?.stepId === progress.activeStepId
        ? stateRecovery.action
        : validationRecovery;

    return {
      scenario,
      mode,
      progress: visibleProgress,
      activeStepIndex,
      completedCount,
      percent: Math.round((completedCount / totalCount) * 100),
      isFinished,
      isChallengeFailed,
      recommendGuidedAfterChallenge,
      isReady: hydrated,
      isGuidedReplay: guidedReplayStepId !== null,
      guidedNavigationPending,
      feedback: effectiveFeedback,
      helpLevel: visibleHelpLevel,
      challengeOutcome: progress.challengeOutcome,
      challengeRemainingSeconds: isChallengeFailed ? 0 : challengeRemainingSeconds,
      recovery,
      revealHelp: () => {
        if (mode !== "guided" || visibleHelpLevel >= 3) return;
        const replayStepId = guidedReplayStepIdRef.current;
        const stepId = replayStepId ?? progressRef.current.activeStepId;
        if (!stepId) return;
        const nextLevel = (visibleHelpLevel + 1) as 1 | 2 | 3;
        if (!replayStepId) {
          setProgress((current) => recordHintUsage(current, stepId, nextLevel));
        }
        setVisibleHelpLevel(nextLevel);
      },
      resetHelp: () => setVisibleHelpLevel(0),
      completeExplanationStep: () => {
        if (mode !== "guided") return;
        const replayStepId = guidedReplayStepIdRef.current;
        const stepId = replayStepId ?? progressRef.current.activeStepId;
        if (!stepId) return;
        const step = scenario.steps.find((candidate) => candidate.id === stepId);
        if (!step || step.stepType !== "explanation") return;
        if (replayStepId) {
          void finishGuidedReplay(step.successMessage);
          return;
        }
        completeStep(step.id, step.successMessage);
      },
      skipOptionalSteps: () => {
        if (mode !== "guided" || guidedReplayStepIdRef.current) return;
        const current = progressRef.current;
        const step = scenario.steps.find((candidate) => candidate.id === current.activeStepId);
        if (!step?.optional) return;
        setProgress((session) => skipConsecutiveOptionalSteps(session, scenario));
        setVisibleHelpLevel(0);
        setStateRecovery(null);
        setFeedback({
          kind: "success",
          message: "Grundbegriffe übersprungen. Du kannst sie jederzeit über das Glossar öffnen.",
        });
      },
      restart: () => {
        guidedReplayStepIdRef.current = null;
        setGuidedReplayStepId(null);
        if (guidedNavigationCoordinator) {
          void guidedNavigationCoordinator.reset(scenario.steps.map((step) => step.id));
        }
        for (const runtime of scenarioRuntimes) {
          if (persistence) {
            void persistence.deleteRuntimeSnapshot(runtime.id).catch(() => undefined);
            void persistence
              .deleteRuntimeSnapshot(guidedRecoveryCheckpointRuntimeId(runtime.id))
              .catch(() => undefined);
          }
          runtime.reset?.();
        }
        setProgress(newSession(scenario, subject));
        setVisibleHelpLevel(0);
        setFeedback(null);
        setStateRecovery(null);
      },
      registerMistake: (message: string) => {
        if (!guidedReplayStepIdRef.current) {
          setProgress((current) => recordMistake(current));
        }
        if (mode !== "explore") setFeedback({ kind: "error", message });
      },
      navigateToGuidedStep,
      performGuidedRecovery,
      ensureGuidedNavigationCheckpoints,
      ensureGuidedRecoveryCheckpoint,
      persistRuntimeSnapshot,
      restoreRuntimeSnapshot,
    };
  }, [
    scenario,
    mode,
    progress,
    hydrated,
    guidedReplayStepId,
    guidedNavigationPending,
    feedback,
    visibleHelpLevel,
    challengeRemainingSeconds,
    recommendGuidedAfterChallenge,
    completeStep,
    finishGuidedReplay,
    navigateToGuidedStep,
    scenarioRuntimes,
    subject,
    persistence,
    guidedNavigationCoordinator,
    stateRecovery,
    performGuidedRecovery,
    ensureGuidedNavigationCheckpoints,
    ensureGuidedRecoveryCheckpoint,
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
