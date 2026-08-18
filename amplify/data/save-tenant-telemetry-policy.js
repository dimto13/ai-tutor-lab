import { util } from "@aws-appsync/utils";

function callerTenant(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  if (!groups.includes("role:tenant_admin")) util.unauthorized();

  let tenantId = null;
  for (const group of groups) {
    if (typeof group === "string" && group.startsWith("tenant:")) {
      const candidate = group.slice("tenant:".length);
      if (candidate.length === 0) util.error("Invalid tenant membership", "TenantMembershipError");
      if (tenantId !== null && tenantId !== candidate) {
        util.error(
          "Multiple tenant memberships require explicit tenant selection",
          "TenantMembershipError",
        );
      }
      tenantId = candidate;
    }
  }
  return tenantId || `personal:${identity.sub}`;
}

function policyId(tenantId) {
  return `telemetry-policy:v1:${util.base64Encode(tenantId)}`;
}

function retentionDays(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || value < 1 || value % 1 !== 0) {
    util.error("Raw telemetry retention days must be a positive integer", "TelemetryPolicyError");
  }
  return value;
}

export function request(ctx) {
  const tenantId = callerTenant(ctx);
  const requestedMode = ctx.args.pseudonymizationMode;
  const requestedRetentionDays = retentionDays(ctx.args.rawEventRetentionDays);
  if (
    requestedMode !== undefined &&
    requestedMode !== null &&
    requestedMode !== "SESSION" &&
    requestedMode !== "ANONYMOUS"
  ) {
    util.error("Unsupported telemetry pseudonymization mode", "TelemetryPolicyError");
  }
  if (
    (requestedMode === undefined || requestedMode === null) &&
    requestedRetentionDays === null
  ) {
    util.error("Telemetry policy update is empty", "TelemetryPolicyError");
  }

  const mode =
    requestedMode === undefined || requestedMode === null
      ? ctx.stash.telemetryPseudonymizationMode
      : requestedMode;
  const rawEventRetentionDays =
    requestedRetentionDays === null
      ? ctx.stash.telemetryRawEventRetentionDays
      : requestedRetentionDays;
  if ((mode !== "SESSION" && mode !== "ANONYMOUS") || typeof rawEventRetentionDays !== "number") {
    util.error("Telemetry policy state is invalid", "TelemetryPolicyError");
  }

  const updatedAt = util.time.nowEpochSeconds();
  ctx.stash.telemetrySavedPolicy = { pseudonymizationMode: mode, rawEventRetentionDays };
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id: policyId(tenantId) }),
    attributeValues: util.dynamodb.toMapValues({
      tenantId,
      pseudonymizationMode: mode,
      rawEventRetentionDays,
      updatedAt,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return ctx.stash.telemetrySavedPolicy;
}
