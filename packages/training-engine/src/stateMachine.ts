import { normalizeGuidedStepProgress } from "./trainingProgress.ts";
import type {
  ChallengeOutcome,
  EngineValidationResult,
  Scenario,
  StepStatus,
  TrainingMode,
  ValidationOutcome,
} from "./types.ts";

export interface Attempt {
  id: string;
  stepId: string;
  outcome: Exclude<ValidationOutcome, "ignore">;
  timestamp: number;
  message?: string;
}

export interface HintUsage {
  stepId: string;
  level: 1 | 2 | 3;
  timestamp: number;
}

/**
 * Framework-free session state used by every runtime mode.
 *
 * Browser adapters may persist this object directly. Additional UI-only state
 * (for example transient feedback or a running timer display) stays outside
 * this contract.
 */
export interface TrainingSession {
  id: string;
  scenarioId: string;
  mode: TrainingMode;
  statuses: Record<string, StepStatus>;
  activeStepId: string | null;
  startedAt: number;
  finishedAt: number | null;
  challengeOutcome: ChallengeOutcome | null;
  hintsUsed: number;
  hintUsage: HintUsage[];
  mistakes: number;
  activeStepMistakes: number;
  attempts: Attempt[];
  lastAction: string | null;
  exploredTargets: string[];
  lastInspectedRef: string | null;
}

export interface StoredTrainingSession
  extends Partial<Omit<TrainingSession, "statuses" | "hintUsage" | "attempts">> {
  statuses?: Record<string, unknown>;
  hintUsage?: unknown[];
  attempts?: unknown[];
}

const STEP_STATUSES = new Set<StepStatus>([
  "NOT_STARTED",
  "ACTIVE",
  "VALIDATION_FAILED",
  "COMPLETED",
  "SKIPPED",
]);

export function createTrainingSession(
  scenario: Scenario,
  sessionId: string,
  now = Date.now(),
): TrainingSession {
  const mode = scenario.mode ?? "guided";
  const activeStepId = mode === "explore" ? null : (scenario.steps[0]?.id ?? null);
  const statuses = Object.fromEntries(
    scenario.steps.map((step) => [
      step.id,
      step.id === activeStepId ? ("ACTIVE" as const) : ("NOT_STARTED" as const),
    ]),
  );

  const session: TrainingSession = {
    id: sessionId,
    scenarioId: scenario.id,
    mode,
    statuses,
    activeStepId,
    startedAt: now,
    finishedAt: scenario.steps.length === 0 ? now : null,
    challengeOutcome: mode === "challenge" ? "active" : null,
    hintsUsed: 0,
    hintUsage: [],
    mistakes: 0,
    activeStepMistakes: 0,
    attempts: [],
    lastAction: null,
    exploredTargets: [],
    lastInspectedRef: null,
  };
  assertSessionInvariant(session);
  return session;
}

/**
 * Deterministically upgrades the pre-SSOT browser progress format into the
 * canonical engine session. Existing localStorage keys can therefore stay
 * stable while the domain state moves behind this package boundary.
 */
export function restoreTrainingSession(
  scenario: Scenario,
  sessionId: string,
  stored: StoredTrainingSession | null | undefined,
  now = Date.now(),
): TrainingSession {
  const fresh = createTrainingSession(scenario, sessionId, now);
  if (!stored?.statuses || typeof stored.statuses !== "object" || Array.isArray(stored.statuses)) {
    return fresh;
  }

  const mode = scenario.mode ?? "guided";
  const startedAt = finiteNumber(stored.startedAt) ?? now;
  const storedFinishedAt = finiteNumber(stored.finishedAt);
  const hintUsage = parseHintUsage(stored.hintUsage);
  const attempts = parseAttempts(stored.attempts);

  let statuses: Record<string, StepStatus>;
  let activeStepId: string | null;
  let finishedAt: number | null;
  let challengeOutcome: ChallengeOutcome | null;

  if (mode === "guided") {
    const guided = normalizeGuidedStepProgress(
      scenario,
      {
        statuses: stored.statuses,
        activeStepId: stored.activeStepId,
        finishedAt: stored.finishedAt,
      },
      now,
    );
    statuses = guided.statuses;
    activeStepId = guided.activeStepId;
    finishedAt = guided.finishedAt;
    challengeOutcome = null;
  } else if (mode === "challenge") {
    const outcome = parseChallengeOutcome(stored.challengeOutcome) ??
      (storedFinishedAt !== null ? "passed" : "active");
    challengeOutcome = outcome;
    statuses = sanitizeStatuses(scenario, stored.statuses, fresh.statuses);
    const challengeStepId = scenario.steps[0]?.id ?? null;
    if (challengeStepId) {
      statuses[challengeStepId] =
        outcome === "passed"
          ? "COMPLETED"
          : outcome === "timed_out"
            ? "VALIDATION_FAILED"
            : "ACTIVE";
    }
    activeStepId = outcome === "active" ? challengeStepId : null;
    finishedAt = outcome === "passed" ? (storedFinishedAt ?? now) : null;
  } else {
    statuses = sanitizeStatuses(scenario, stored.statuses, fresh.statuses);
    activeStepId = null;
    challengeOutcome = null;
    const exploredTargets = parseStringArray(stored.exploredTargets).filter((ref) =>
      (scenario.exploreTargets ?? []).includes(ref),
    );
    const targetCount = scenario.exploreTargets?.length ?? 0;
    finishedAt =
      targetCount > 0 && exploredTargets.length >= targetCount
        ? (storedFinishedAt ?? now)
        : null;
  }

  const exploredTargets = parseStringArray(stored.exploredTargets).filter((ref) =>
    (scenario.exploreTargets ?? []).includes(ref),
  );
  const lastInspectedRef =
    typeof stored.lastInspectedRef === "string" && exploredTargets.includes(stored.lastInspectedRef)
      ? stored.lastInspectedRef
      : null;

  const session: TrainingSession = {
    id: sessionId,
    scenarioId: scenario.id,
    mode,
    statuses,
    activeStepId,
    startedAt,
    finishedAt,
    challengeOutcome,
    hintsUsed: finiteNumber(stored.hintsUsed) ?? hintUsage.length,
    hintUsage,
    mistakes: finiteNumber(stored.mistakes) ?? attempts.filter((a) => a.outcome === "near-miss").length,
    activeStepMistakes: finiteNumber(stored.activeStepMistakes) ?? 0,
    attempts,
    lastAction: typeof stored.lastAction === "string" ? stored.lastAction : null,
    exploredTargets,
    lastInspectedRef,
  };
  assertSessionInvariant(session);
  return session;
}

export function applyValidationResult(
  session: TrainingSession,
  scenario: Scenario,
  stepId: string,
  result: EngineValidationResult,
  now = Date.now(),
  options: { countNearMiss?: boolean } = {},
): TrainingSession {
  if (result.outcome === "ignore") return session;
  if (session.mode !== "guided" || session.finishedAt !== null || session.activeStepId !== stepId) {
    return session;
  }

  const step = scenario.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Unknown step ${stepId} in scenario ${scenario.id}`);

  if (result.outcome === "near-miss" && options.countNearMiss === false) return session;

  const attempts = [
    ...session.attempts,
    createAttempt(session, stepId, result.outcome, now, result.message),
  ];

  if (result.outcome === "near-miss") {
    const next: TrainingSession = {
      ...session,
      statuses: { ...session.statuses, [stepId]: "VALIDATION_FAILED" },
      mistakes: session.mistakes + 1,
      activeStepMistakes: session.activeStepMistakes + 1,
      attempts,
    };
    assertSessionInvariant(next);
    return next;
  }

  return completeTrainingStep(
    { ...session, attempts },
    scenario,
    stepId,
    now,
  );
}

/** Completes an explanation or otherwise explicitly acknowledged guided step. */
export function completeTrainingStep(
  session: TrainingSession,
  scenario: Scenario,
  stepId: string,
  now = Date.now(),
): TrainingSession {
  if (session.mode !== "guided" || session.finishedAt !== null || session.activeStepId !== stepId) {
    return session;
  }
  if (!scenario.steps.some((candidate) => candidate.id === stepId)) {
    throw new Error(`Unknown step ${stepId} in scenario ${scenario.id}`);
  }

  const statuses = { ...session.statuses, [stepId]: "COMPLETED" as const };
  const activeStepId = findNextStepId(scenario, statuses, stepId);
  if (activeStepId) statuses[activeStepId] = "ACTIVE";

  const next: TrainingSession = {
    ...session,
    statuses,
    activeStepId,
    activeStepMistakes: 0,
    finishedAt: activeStepId ? null : now,
  };
  assertSessionInvariant(next);
  return next;
}

export function skipOptionalStep(
  session: TrainingSession,
  scenario: Scenario,
  stepId: string,
  now = Date.now(),
): TrainingSession {
  if (session.mode !== "guided" || session.activeStepId !== stepId) return session;
  const step = scenario.steps.find((candidate) => candidate.id === stepId);
  if (!step?.optional) throw new Error(`Step ${stepId} is not optional`);

  const statuses = { ...session.statuses, [stepId]: "SKIPPED" as const };
  const activeStepId = findNextStepId(scenario, statuses, stepId);
  if (activeStepId) statuses[activeStepId] = "ACTIVE";

  const next: TrainingSession = {
    ...session,
    statuses,
    activeStepId,
    activeStepMistakes: 0,
    finishedAt: activeStepId ? null : now,
  };
  assertSessionInvariant(next);
  return next;
}

export function skipConsecutiveOptionalSteps(
  session: TrainingSession,
  scenario: Scenario,
  now = Date.now(),
): TrainingSession {
  let next = session;
  while (next.activeStepId) {
    const step = scenario.steps.find((candidate) => candidate.id === next.activeStepId);
    if (!step?.optional) break;
    next = skipOptionalStep(next, scenario, step.id, now);
  }
  return next;
}

export function recordHintUsage(
  session: TrainingSession,
  stepId: string,
  level: 1 | 2 | 3,
  now = Date.now(),
): TrainingSession {
  if (session.mode !== "guided" || session.activeStepId !== stepId) return session;
  return {
    ...session,
    hintsUsed: session.hintsUsed + 1,
    hintUsage: [...session.hintUsage, { stepId, level, timestamp: now }],
  };
}

export function activeHelpLevel(session: TrainingSession): number {
  if (!session.activeStepId) return 0;
  return session.hintUsage.reduce(
    (level, usage) =>
      usage.stepId === session.activeStepId ? Math.max(level, usage.level) : level,
    0,
  );
}

export function recordMistake(session: TrainingSession): TrainingSession {
  if (session.mode === "explore") return session;
  return {
    ...session,
    mistakes: session.mistakes + 1,
    activeStepMistakes: session.activeStepMistakes + 1,
  };
}

export function recordLastAction(session: TrainingSession, action: string): TrainingSession {
  return session.lastAction === action ? session : { ...session, lastAction: action };
}

export function inspectExploreTarget(
  session: TrainingSession,
  scenario: Scenario,
  ref: string,
  now = Date.now(),
): TrainingSession {
  if (session.mode !== "explore" || !(scenario.exploreTargets ?? []).includes(ref)) return session;
  const exploredTargets = session.exploredTargets.includes(ref)
    ? session.exploredTargets
    : [...session.exploredTargets, ref];
  const targetCount = scenario.exploreTargets?.length ?? 0;
  return {
    ...session,
    exploredTargets,
    lastInspectedRef: ref,
    finishedAt:
      targetCount > 0 && exploredTargets.length >= targetCount
        ? (session.finishedAt ?? now)
        : session.finishedAt,
  };
}

export function completeChallenge(
  session: TrainingSession,
  scenario: Scenario,
  now = Date.now(),
): TrainingSession {
  if (session.mode !== "challenge" || session.challengeOutcome !== "active") return session;
  const challengeStep = scenario.steps[0];
  const next: TrainingSession = {
    ...session,
    statuses: challengeStep
      ? { ...session.statuses, [challengeStep.id]: "COMPLETED" }
      : session.statuses,
    activeStepId: null,
    finishedAt: session.finishedAt ?? now,
    challengeOutcome: "passed",
    activeStepMistakes: 0,
  };
  assertSessionInvariant(next);
  return next;
}

export function timeoutChallenge(
  session: TrainingSession,
  scenario: Scenario,
): TrainingSession {
  if (session.mode !== "challenge" || session.challengeOutcome !== "active") return session;
  const challengeStep = scenario.steps[0];
  const next: TrainingSession = {
    ...session,
    statuses: challengeStep
      ? { ...session.statuses, [challengeStep.id]: "VALIDATION_FAILED" }
      : session.statuses,
    activeStepId: null,
    challengeOutcome: "timed_out",
  };
  assertSessionInvariant(next);
  return next;
}

export function challengeDeadlineAt(
  scenario: Scenario,
  session: Pick<TrainingSession, "startedAt">,
): number | null {
  return scenario.timeLimitSeconds === undefined
    ? null
    : session.startedAt + scenario.timeLimitSeconds * 1000;
}

export function isChallengeDeadlineExpired(
  scenario: Scenario,
  session: Pick<TrainingSession, "startedAt">,
  now = Date.now(),
): boolean {
  const deadline = challengeDeadlineAt(scenario, session);
  return deadline !== null && now >= deadline;
}

export function assertSessionInvariant(session: TrainingSession): void {
  const activeStatuses = Object.entries(session.statuses).filter(
    ([, status]) => status === "ACTIVE",
  );
  if (activeStatuses.length > 1) {
    throw new Error(`Training session ${session.id} has more than one ACTIVE step`);
  }
  if (session.activeStepId === null && activeStatuses.length !== 0) {
    throw new Error(`Training session ${session.id} has ACTIVE state without activeStepId`);
  }
  if (
    session.activeStepId !== null &&
    session.statuses[session.activeStepId] !== "ACTIVE" &&
    session.statuses[session.activeStepId] !== "VALIDATION_FAILED"
  ) {
    throw new Error(`Training session ${session.id} has an invalid activeStepId`);
  }
}

function createAttempt(
  session: TrainingSession,
  stepId: string,
  outcome: Exclude<ValidationOutcome, "ignore">,
  timestamp: number,
  message?: string,
): Attempt {
  return {
    id: `${session.id}:${stepId}:${session.attempts.length + 1}`,
    stepId,
    outcome,
    timestamp,
    ...(message ? { message } : {}),
  };
}

function findNextStepId(
  scenario: Scenario,
  statuses: Record<string, StepStatus>,
  completedStepId: string,
): string | null {
  const startIndex = scenario.steps.findIndex((step) => step.id === completedStepId);
  for (const step of scenario.steps.slice(startIndex + 1)) {
    const status = statuses[step.id] ?? "NOT_STARTED";
    if (status !== "COMPLETED" && status !== "SKIPPED") return step.id;
  }
  return null;
}

function sanitizeStatuses(
  scenario: Scenario,
  stored: Record<string, unknown>,
  fallback: Record<string, StepStatus>,
): Record<string, StepStatus> {
  return Object.fromEntries(
    scenario.steps.map((step) => {
      const value = stored[step.id];
      return [step.id, STEP_STATUSES.has(value as StepStatus) ? (value as StepStatus) : fallback[step.id]!];
    }),
  );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseChallengeOutcome(value: unknown): ChallengeOutcome | null {
  return value === "active" || value === "passed" || value === "timed_out" ? value : null;
}

function parseHintUsage(value: unknown): HintUsage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HintUsage => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const usage = item as Partial<HintUsage>;
    return (
      typeof usage.stepId === "string" &&
      (usage.level === 1 || usage.level === 2 || usage.level === 3) &&
      finiteNumber(usage.timestamp) !== null
    );
  });
}

function parseAttempts(value: unknown): Attempt[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Attempt => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const attempt = item as Partial<Attempt>;
    return (
      typeof attempt.id === "string" &&
      typeof attempt.stepId === "string" &&
      (attempt.outcome === "pass" || attempt.outcome === "near-miss") &&
      finiteNumber(attempt.timestamp) !== null &&
      (attempt.message === undefined || typeof attempt.message === "string")
    );
  });
}
