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

export function request(ctx) {
  const tenantId = callerTenant(ctx);
  const mode = ctx.args.pseudonymizationMode;
  if (mode !== "SESSION" && mode !== "ANONYMOUS") {
    util.error("Unsupported telemetry pseudonymization mode", "TelemetryPolicyError");
  }

  const updatedAt = util.time.nowEpochSeconds();
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id: policyId(tenantId) }),
    attributeValues: util.dynamodb.toMapValues({
      tenantId,
      pseudonymizationMode: mode,
      updatedAt,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return { pseudonymizationMode: ctx.args.pseudonymizationMode };
}