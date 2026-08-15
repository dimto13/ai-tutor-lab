import { getHelpBonusDeductionPercent, type HelpLevel } from "./helpPolicy.ts";
import type { TrainingSubjectRef } from "./stateMachine.ts";
import type { TrainingMode } from "./types.ts";

export const SCORE_BASE_PERCENT = 70 as const;
export const SCORE_BONUS_PERCENT = 30 as const;
export const SCORE_POINT_PRECISION = 2 as const;
export const SCORE_EVENT_SCHEMA_VERSION = 1 as const;
export const SCORE_EVENT_TYPE = "scenario.score.awarded" as const;

export const SCORE_MODE_MULTIPLIER = {
  explore: 0.5,
  guided: 1,
  challenge: 2,
} as const satisfies Record<TrainingMode, number>;

export interface ScoreHintUsage {
  stepId: string;
  level: HelpLevel;
}

/**
 * Trusted evidence required to calculate a score. Application/server code must derive this
 * from authoritative scenario/session state rather than accepting a client-computed total.
 */
export interface ScenarioScoreInput {
  scenarioPoints: number;
  mode: TrainingMode;
  stepIds: readonly string[];
  hintUsage?: readonly ScoreHintUsage[];
  failedAttempts?: number;
}

export interface ScenarioScoreBreakdown {
  scenarioPoints: number;
  basePoints: number;
  bonusPoints: number;
  bonusDeductionPoints: number;
  earnedBonusPoints: number;
  modeMultiplier: number;
  awardedPoints: number;
  failedAttempts: number;
  highestHintLevelByStep: Readonly<Record<string, HelpLevel>>;
}

/** The identity that may produce points at most once. Mode and session are deliberately excluded. */
export interface ScoreAwardIdentity {
  subject: TrainingSubjectRef;
  scenarioId: string;
  scenarioVersion: string;
}

export interface CreateScoreEventInput extends ScoreAwardIdentity, ScenarioScoreInput {
  sessionId: string;
  occurredAt: number;
}

/** Append-only, auditable record for one awarded scenario/version. */
export interface ScoreEvent {
  schemaVersion: typeof SCORE_EVENT_SCHEMA_VERSION;
  id: string;
  deduplicationKey: string;
  type: typeof SCORE_EVENT_TYPE;
  subject: TrainingSubjectRef;
  scenarioId: string;
  scenarioVersion: string;
  sessionId: string;
  mode: TrainingMode;
  occurredAt: number;
  points: number;
  breakdown: ScenarioScoreBreakdown;
}

export interface AppendScoreEventResult {
  created: boolean;
  event: ScoreEvent;
}

/**
 * Cloud-neutral persistence port for the later server adapter.
 * Implementations MUST atomically enforce uniqueness by `event.deduplicationKey` and return the
 * already persisted event with `created: false` when the same award is retried.
 */
export interface ScoreEventLedger {
  appendOnce(event: ScoreEvent): Promise<AppendScoreEventResult>;
}

export function calculateScenarioScore(input: ScenarioScoreInput): ScenarioScoreBreakdown {
  assertFiniteNonNegative(input.scenarioPoints, "scenarioPoints");
  assertNonNegativeInteger(input.failedAttempts ?? 0, "failedAttempts");
  assertDistinctNonEmptyIds(input.stepIds, "stepIds");

  const knownSteps = new Set(input.stepIds);
  const highestHintLevelByStep: Record<string, HelpLevel> = {};
  for (const usage of input.hintUsage ?? []) {
    assertNonEmptyId(usage.stepId, "hintUsage.stepId");
    if (!knownSteps.has(usage.stepId)) {
      throw new Error(`Hint usage references unknown scoring step ${usage.stepId}`);
    }
    const current = highestHintLevelByStep[usage.stepId];
    if (current === undefined || usage.level > current) {
      highestHintLevelByStep[usage.stepId] = usage.level;
    }
  }

  const basePointsRaw = input.scenarioPoints * (SCORE_BASE_PERCENT / 100);
  const bonusPointsRaw = input.scenarioPoints * (SCORE_BONUS_PERCENT / 100);
  let bonusDeductionRaw = 0;

  if (input.mode !== "explore" && input.stepIds.length > 0) {
    const stepBonus = bonusPointsRaw / input.stepIds.length;
    for (const level of Object.values(highestHintLevelByStep)) {
      bonusDeductionRaw += stepBonus * (getHelpBonusDeductionPercent(level) / 100);
    }
  }

  const earnedBonusRaw = Math.max(0, bonusPointsRaw - bonusDeductionRaw);
  const modeMultiplier = SCORE_MODE_MULTIPLIER[input.mode];
  const awardedPointsRaw = (basePointsRaw + earnedBonusRaw) * modeMultiplier;

  return {
    scenarioPoints: roundScorePoints(input.scenarioPoints),
    basePoints: roundScorePoints(basePointsRaw),
    bonusPoints: roundScorePoints(bonusPointsRaw),
    bonusDeductionPoints: roundScorePoints(bonusDeductionRaw),
    earnedBonusPoints: roundScorePoints(earnedBonusRaw),
    modeMultiplier,
    awardedPoints: roundScorePoints(awardedPointsRaw),
    failedAttempts: input.failedAttempts ?? 0,
    highestHintLevelByStep,
  };
}

/** Stable retry/deduplication ID scoped to learner + scenario + scenario version. */
export function createScoreAwardId(identity: ScoreAwardIdentity): string {
  assertTrainingSubject(identity.subject);
  assertNonEmptyId(identity.scenarioId, "scenarioId");
  assertNonEmptyId(identity.scenarioVersion, "scenarioVersion");

  const tenantPart =
    identity.subject.tenantId === null
      ? "n"
      : `s:${encodeURIComponent(identity.subject.tenantId)}`;

  return [
    "score-award:v1",
    tenantPart,
    `u:${encodeURIComponent(identity.subject.userId)}`,
    `s:${encodeURIComponent(identity.scenarioId)}`,
    `v:${encodeURIComponent(identity.scenarioVersion)}`,
  ].join("|");
}

export function createScoreEvent(input: CreateScoreEventInput): ScoreEvent {
  assertNonEmptyId(input.sessionId, "sessionId");
  assertFiniteNonNegative(input.occurredAt, "occurredAt");

  const id = createScoreAwardId(input);
  const breakdown = calculateScenarioScore(input);
  return {
    schemaVersion: SCORE_EVENT_SCHEMA_VERSION,
    id,
    deduplicationKey: id,
    type: SCORE_EVENT_TYPE,
    subject: { ...input.subject },
    scenarioId: input.scenarioId,
    scenarioVersion: input.scenarioVersion,
    sessionId: input.sessionId,
    mode: input.mode,
    occurredAt: input.occurredAt,
    points: breakdown.awardedPoints,
    breakdown,
  };
}

export function roundScorePoints(points: number): number {
  const factor = 10 ** SCORE_POINT_PRECISION;
  return Math.round(points * factor) / factor;
}

function assertTrainingSubject(subject: TrainingSubjectRef): void {
  assertNonEmptyId(subject.userId, "subject.userId");
  if (subject.tenantId !== null) assertNonEmptyId(subject.tenantId, "subject.tenantId");
}

function assertDistinctNonEmptyIds(ids: readonly string[], fieldName: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    assertNonEmptyId(id, fieldName);
    if (seen.has(id)) throw new Error(`${fieldName} contains duplicate id ${id}`);
    seen.add(id);
  }
}

function assertNonEmptyId(value: string, fieldName: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${fieldName} must be non-empty and must not contain surrounding whitespace`);
  }
}

function assertFiniteNonNegative(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a finite non-negative number`);
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
}
