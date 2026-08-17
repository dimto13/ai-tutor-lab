import { util } from "@aws-appsync/utils";

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  let tenantId = null;
  for (const group of groups) {
    if (typeof group === "string" && group.startsWith("tenant:")) {
      const candidate = group.slice("tenant:".length);
      if (candidate.length === 0) {
        util.error("Invalid tenant membership", "TenantMembershipError");
      }
      if (tenantId !== null && tenantId !== candidate) {
        util.error(
          "Multiple tenant memberships require explicit tenant selection",
          "TenantMembershipError",
        );
      }
      tenantId = candidate;
    }
  }

  return {
    userId: identity.sub,
    tenantId: tenantId || `personal:${identity.sub}`,
  };
}

function policyId(tenantId) {
  return `telemetry-policy:v1:${util.base64Encode(tenantId)}`;
}

export function request(ctx) {
  const subject = caller(ctx);
  ctx.stash.telemetrySubject = subject;
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: policyId(subject.tenantId) }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const row = ctx.result;
  const mode = row && row.pseudonymizationMode === "ANONYMOUS" ? "ANONYMOUS" : "SESSION";
  ctx.stash.telemetryPseudonymizationMode = mode;
  return row;
}