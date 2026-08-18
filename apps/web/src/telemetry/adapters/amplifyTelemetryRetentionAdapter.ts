import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../../amplify/data/resource";
import type { TelemetryDeletionPage, TelemetryRetentionPort } from "../telemetryRetention";

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data telemetry retention error";
  const messages = errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean);
  return messages.join("; ") || "Unknown Amplify Data telemetry retention error";
}

function retentionDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("Telemetry raw-event retention is invalid");
  }
  return value;
}

function deletionPage(value: unknown): TelemetryDeletionPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Telemetry deletion result is invalid");
  }
  const deletedCount = Reflect.get(value, "deletedCount");
  const complete = Reflect.get(value, "complete");
  if (typeof deletedCount !== "number" || !Number.isInteger(deletedCount) || deletedCount < 0) {
    throw new Error("Telemetry deletion count is invalid");
  }
  if (typeof complete !== "boolean") throw new Error("Telemetry deletion completion is invalid");
  return { deletedCount, complete };
}

export function createAmplifyTelemetryRetentionPortWithClient(
  client: ReturnType<typeof generateClient<Schema>>,
): TelemetryRetentionPort {
  return {
    async loadRetentionPolicy() {
      const result = await client.queries.loadTenantTelemetryPolicy();
      if (result.errors?.length) throw new Error(errorText(result.errors));
      return { rawEventRetentionDays: retentionDays(result.data?.rawEventRetentionDays) };
    },
    async saveRawEventRetentionDays(days) {
      const result = await client.mutations.saveTenantTelemetryPolicy({
        rawEventRetentionDays: days,
      });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (result.data?.rawEventRetentionDays !== days) {
        throw new Error("Telemetry retention policy was not persisted");
      }
    },
    async deleteMyRawTelemetryPage() {
      const result = await client.mutations.deleteMyPersonalTelemetry();
      if (result.errors?.length) throw new Error(errorText(result.errors));
      return deletionPage(result.data);
    },
  };
}

export function createAmplifyTelemetryRetentionPort(): TelemetryRetentionPort {
  return createAmplifyTelemetryRetentionPortWithClient(generateClient<Schema>());
}
