import type {
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

export interface TrainingSession {
  id: string;
  scenarioId: string;
  mode: TrainingMode;
  statuses: Record<string, StepStatus>;
  activeStepId: string | null;
  startedAt: number;
  finishedAt: number | null;
  mistakes: number;
  attempts: Attempt[];
  hintUsage: HintUsage[];
}

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
    mistakes: 0,
    attempts: [],
    hintUsage: [],
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
): TrainingSession {
  if (result.outcome === "ignore") return session;
  if (session.finishedAt !== null || session.activeStepId !== stepId) return session;

  const step = scenario.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Unknown step ${stepId} in scenario ${scenario.id}`);

  const attempts = [
    ...session.attempts,
    createAttempt(session, stepId, result.outcome, now, result.message),
  ];

  if (result.outcome === "near-miss") {
    const next = {
      ...session,
      statuses: { ...session.statuses, [stepId]: "VALIDATION_FAILED" as const },
      mistakes: session.mistakes + 1,
      attempts,
    };
    assertSessionInvariant(next);
    return next;
  }

  const statuses = { ...session.statuses, [stepId]: "COMPLETED" as const };
  const activeStepId = findNextStepId(scenario, statuses, stepId);
  if (activeStepId) statuses[activeStepId] = "ACTIVE";

  const next: TrainingSession = {
    ...session,
    statuses,
    activeStepId,
    finishedAt: activeStepId ? null : now,
    attempts,
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
  if (session.activeStepId !== stepId) return session;
  const step = scenario.steps.find((candidate) => candidate.id === stepId);
  if (!step?.optional) throw new Error(`Step ${stepId} is not optional`);

  const statuses = { ...session.statuses, [stepId]: "SKIPPED" as const };
  const activeStepId = findNextStepId(scenario, statuses, stepId);
  if (activeStepId) statuses[activeStepId] = "ACTIVE";

  const next: TrainingSession = {
    ...session,
    statuses,
    activeStepId,
    finishedAt: activeStepId ? null : now,
  };
  assertSessionInvariant(next);
  return next;
}

export function recordHintUsage(
  session: TrainingSession,
  stepId: string,
  level: 1 | 2 | 3,
  now = Date.now(),
): TrainingSession {
  return {
    ...session,
    hintUsage: [...session.hintUsage, { stepId, level, timestamp: now }],
  };
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
