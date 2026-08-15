import { generateClient } from "aws-amplify/data";
import {
  SCORE_EVENT_SCHEMA_VERSION,
  SCORE_EVENT_TYPE,
  type AppendScoreEventResult,
  type HelpLevel,
  type ScenarioScoreBreakdown,
  type ScenarioScoreService,
  type ScoreEvent,
  type TrainingMode,
} from "@ai-train-lab/training-engine";
import type { Schema } from "../../../../../amplify/data/resource";

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data scoring error";
  const messages = errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean);
  return messages.join("; ") || "Unknown Amplify Data scoring error";
}

function objectValue(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Score event ${fieldName} is invalid`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Score event ${fieldName} is invalid`);
  }
  return value;
}

function finiteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Score event ${fieldName} is invalid`);
  }
  return value;
}

function trainingMode(value: unknown): TrainingMode {
  if (value === "explore" || value === "guided" || value === "challenge") return value;
  throw new Error("Score event mode is invalid");
}

function highestHintLevels(value: unknown): Readonly<Record<string, HelpLevel>> {
  const source = objectValue(value, "highestHintLevelByStep");
  const parsed: Record<string, HelpLevel> = {};
  for (const [stepId, level] of Object.entries(source)) {
    if (level !== 1 && level !== 2 && level !== 3) {
      throw new Error("Score event contains an invalid help level");
    }
    parsed[stepId] = level;
  }
  return parsed;
}

function scoreBreakdown(value: unknown): ScenarioScoreBreakdown {
  const source = objectValue(value, "breakdown");
  return {
    scenarioPoints: finiteNumber(source["scenarioPoints"], "breakdown.scenarioPoints"),
    basePoints: finiteNumber(source["basePoints"], "breakdown.basePoints"),
    bonusPoints: finiteNumber(source["bonusPoints"], "breakdown.bonusPoints"),
    bonusDeductionPoints: finiteNumber(
      source["bonusDeductionPoints"],
      "breakdown.bonusDeductionPoints",
    ),
    earnedBonusPoints: finiteNumber(source["earnedBonusPoints"], "breakdown.earnedBonusPoints"),
    modeMultiplier: finiteNumber(source["modeMultiplier"], "breakdown.modeMultiplier"),
    awardedPoints: finiteNumber(source["awardedPoints"], "breakdown.awardedPoints"),
    failedAttempts: finiteNumber(source["failedAttempts"], "breakdown.failedAttempts"),
    highestHintLevelByStep: highestHintLevels(source["highestHintLevelByStep"]),
  };
}

function scoreEvent(value: unknown): ScoreEvent {
  const source = objectValue(value, "payload");
  const type = stringValue(source["eventType"], "eventType");
  if (type !== SCORE_EVENT_TYPE) throw new Error(`Unsupported score event type: ${type}`);
  const id = stringValue(source["id"], "id");
  const userId = stringValue(source["userId"], "userId");
  const persistedTenantId = stringValue(source["tenantId"], "tenantId");
  const sourceRevision = finiteNumber(source["sourceRevision"], "sourceRevision");
  if (!Number.isInteger(sourceRevision) || sourceRevision < 1) {
    throw new Error("Score event sourceRevision is invalid");
  }

  return {
    schemaVersion: SCORE_EVENT_SCHEMA_VERSION,
    id,
    deduplicationKey: id,
    type: SCORE_EVENT_TYPE,
    subject: {
      userId,
      tenantId: id.startsWith("score-award:v1|t:n|") ? null : persistedTenantId,
    },
    scenarioId: stringValue(source["scenarioId"], "scenarioId"),
    scenarioVersion: stringValue(source["scenarioVersion"], "scenarioVersion"),
    sessionId: stringValue(source["sessionId"], "sessionId"),
    mode: trainingMode(source["mode"]),
    occurredAt: finiteNumber(source["occurredAt"], "occurredAt"),
    points: finiteNumber(source["points"], "points"),
    breakdown: scoreBreakdown(source["breakdown"]),
    sourceRevision,
  };
}

export function createAmplifyScenarioScoreServiceWithClient(
  client: ReturnType<typeof generateClient<Schema>>,
): ScenarioScoreService {
  return {
    async awardScenario(request): Promise<AppendScoreEventResult> {
      const result = await client.mutations.awardScenarioScore({
        scenarioId: request.scenarioId,
        mode: request.mode,
      });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (!result.data) throw new Error("Server returned no score award result");
      return {
        created: result.data.created === true,
        event: scoreEvent(result.data.event),
      };
    },

    async listScoreEvents(limit) {
      const result = await client.queries.listMyScoreEvents(limit === undefined ? {} : { limit });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      const events: ScoreEvent[] = [];
      for (const value of result.data ?? []) {
        if (value) events.push(scoreEvent(value));
      }
      return events;
    },
  };
}

export function createAmplifyScenarioScoreService(): ScenarioScoreService {
  return createAmplifyScenarioScoreServiceWithClient(generateClient<Schema>());
}
