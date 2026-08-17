import { generateClient } from "aws-amplify/data";
import type { TrainingEvent } from "@ai-train-lab/training-engine";
import type { Schema } from "../../../../../amplify/data/resource";
import {
  TelemetryDeliveryError,
  type ScenarioLearningAnalytics,
  type StepLearningMetric,
  type TelemetryEventWriter,
  type TelemetryPseudonymizationMode,
  type TrainingAnalyticsService,
} from "../telemetryPipeline";

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data telemetry error";
  const messages = errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean);
  return messages.join("; ") || "Unknown Amplify Data telemetry error";
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Training analytics ${field} is invalid`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Training analytics ${field} is invalid`);
  }
  return value;
}

function optionalDuration(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return nonNegativeNumber(value, "averageDurationMs");
}

function failurePatterns(value: unknown): StepLearningMetric["failurePatterns"] {
  if (!Array.isArray(value)) throw new Error("Training analytics failurePatterns is invalid");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Training analytics failure pattern is invalid");
    }
    const source = entry as Record<string, unknown>;
    return {
      pattern: requiredString(source["pattern"], "failure pattern"),
      count: nonNegativeNumber(source["count"], "failure pattern count"),
    };
  });
}

function stepMetric(value: unknown): StepLearningMetric {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Training analytics step metric is invalid");
  }
  const source = value as Record<string, unknown>;
  return {
    stepId: requiredString(source["stepId"], "stepId"),
    abandonmentCount: nonNegativeNumber(source["abandonmentCount"], "abandonmentCount"),
    hintUsageCount: nonNegativeNumber(source["hintUsageCount"], "hintUsageCount"),
    averageDurationMs: optionalDuration(source["averageDurationMs"]),
    failedAttemptCount: nonNegativeNumber(source["failedAttemptCount"], "failedAttemptCount"),
    failurePatterns: failurePatterns(source["failurePatterns"]),
  };
}

function scenarioAnalytics(value: unknown): ScenarioLearningAnalytics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Training analytics payload is invalid");
  }
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source["steps"])) throw new Error("Training analytics steps is invalid");
  if (
    typeof source["cohortSuppressed"] !== "boolean" ||
    typeof source["truncated"] !== "boolean"
  ) {
    throw new Error("Training analytics privacy metadata is invalid");
  }
  return {
    scenarioId: requiredString(source["scenarioId"], "scenarioId"),
    sessionsStarted: nonNegativeNumber(source["sessionsStarted"], "sessionsStarted"),
    sessionsCompleted: nonNegativeNumber(source["sessionsCompleted"], "sessionsCompleted"),
    abandonmentCount: nonNegativeNumber(source["abandonmentCount"], "abandonmentCount"),
    cohortSuppressed: source["cohortSuppressed"],
    truncated: source["truncated"],
    steps: source["steps"].map(stepMetric),
  };
}

function pseudonymizationMode(value: unknown): TelemetryPseudonymizationMode {
  if (value === "SESSION" || value === "ANONYMOUS") return value;
  throw new Error("Telemetry pseudonymization mode is invalid");
}

function isoTimestamp(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Training analytics time bound is invalid");
  return new Date(value).toISOString();
}

export function createAmplifyTelemetryEventWriterWithClient(
  client: ReturnType<typeof generateClient<Schema>>,
): TelemetryEventWriter {
  return {
    async write(event: TrainingEvent) {
      const result = await client.mutations.appendTrainingTelemetryEvent({ event });
      if (result.errors?.length) {
        throw new TelemetryDeliveryError(errorText(result.errors), false);
      }
      if (result.data !== true) {
        throw new TelemetryDeliveryError("Telemetry event was not acknowledged", false);
      }
    },
  };
}

export function createAmplifyTelemetryEventWriter(): TelemetryEventWriter {
  return createAmplifyTelemetryEventWriterWithClient(generateClient<Schema>());
}

export function createAmplifyTrainingAnalyticsServiceWithClient(
  client: ReturnType<typeof generateClient<Schema>>,
): TrainingAnalyticsService {
  return {
    async loadScenarioMetrics(query) {
      const result = await client.queries.loadTrainingAnalytics({
        scenarioId: query.scenarioId,
        ...(query.from === undefined ? {} : { from: isoTimestamp(query.from) }),
        ...(query.to === undefined ? {} : { to: isoTimestamp(query.to) }),
      });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      return scenarioAnalytics(result.data);
    },
    async loadPseudonymizationMode() {
      const result = await client.queries.loadTenantTelemetryPolicy();
      if (result.errors?.length) throw new Error(errorText(result.errors));
      return pseudonymizationMode(result.data?.pseudonymizationMode);
    },
    async savePseudonymizationMode(mode) {
      const result = await client.mutations.saveTenantTelemetryPolicy({ pseudonymizationMode: mode });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (result.data?.pseudonymizationMode !== mode) {
        throw new Error("Telemetry pseudonymization policy was not persisted");
      }
    },
  };
}

export function createAmplifyTrainingAnalyticsService(): TrainingAnalyticsService {
  return createAmplifyTrainingAnalyticsServiceWithClient(generateClient<Schema>());
}