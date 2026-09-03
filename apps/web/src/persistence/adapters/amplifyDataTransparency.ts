import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../../amplify/data/resource";
import { UserFacingError, userFacingError } from "../../errors/userFacingError";

export interface AmplifyDataTransparencyContext {
  scoreVisibility: "private" | "aggregate" | "named";
  leaderboardsEnabled: boolean;
  namedApprovalConfirmed: boolean;
  rawTelemetryRetentionDays: number | null;
  telemetryPseudonymizationMode: "SESSION" | "ANONYMOUS" | null;
}

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data error";
  return errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean)
    .join("; ");
}

function isTenantMembershipFailure(errors: unknown): boolean {
  if (!Array.isArray(errors)) return false;
  return errors.some((error) => {
    if (typeof error !== "object" || error === null) return false;
    const message = Reflect.get(error, "message");
    return (
      typeof message === "string" &&
      (message.includes("Tenant membership is required") ||
        message.includes("Exactly one tenant membership is required"))
    );
  });
}

function providerBoundaryError(errors: unknown) {
  const cause = new Error(errorText(errors));
  if (isTenantMembershipFailure(errors)) {
    return new UserFacingError("tenant-context", cause.message, cause);
  }
  return userFacingError(cause);
}

export async function loadAmplifyDataTransparencyContext(): Promise<AmplifyDataTransparencyContext> {
  const client = generateClient<Schema>();
  const result = await client.queries.loadMyDataTransparencyContext();
  if (result.errors?.length) throw providerBoundaryError(result.errors);
  if (!result.data) {
    throw userFacingError(new Error("Amplify Data returned no transparency context"));
  }

  return {
    scoreVisibility: result.data.scoreVisibility,
    leaderboardsEnabled: result.data.leaderboardsEnabled,
    namedApprovalConfirmed: result.data.namedApprovalConfirmed,
    rawTelemetryRetentionDays: result.data.rawTelemetryRetentionDays,
    telemetryPseudonymizationMode: result.data.telemetryPseudonymizationMode,
  };
}

export async function exportAmplifyOwnData(): Promise<unknown> {
  const client = generateClient<Schema>();
  const result = await client.queries.exportMyData();
  if (result.errors?.length) throw providerBoundaryError(result.errors);
  if (typeof result.data !== "string") {
    throw userFacingError(new Error("Amplify Data returned no own-data export"));
  }

  try {
    return JSON.parse(result.data) as unknown;
  } catch {
    throw userFacingError(new Error("Amplify Data returned invalid JSON for the own-data export"));
  }
}
