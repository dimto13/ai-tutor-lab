import { util } from "@aws-appsync/utils";

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  let tenantId = null;
  for (const group of groups) {
    if (typeof group !== "string" || !group.startsWith("tenant:")) continue;
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

  return {
    userId: identity.sub,
    tenantId: tenantId || `personal:${identity.sub}`,
  };
}

function itemId(subject, scenarioId, mode, runtimeId) {
  return [
    "runtime",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
    util.base64Encode(scenarioId),
    mode,
    util.base64Encode(runtimeId),
  ].join(".");
}

export function request(ctx) {
  const subject = caller(ctx);
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({
      id: itemId(subject, ctx.args.scenarioId, ctx.args.mode, ctx.args.runtimeId),
    }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (!ctx.result) return null;
  return {
    tenantId: ctx.result.tenantId,
    userId: ctx.result.userId,
    scenarioId: ctx.result.scenarioId,
    mode: ctx.result.mode,
    runtimeId: ctx.result.runtimeId,
    schemaVersion: ctx.result.schemaVersion,
    revision: ctx.result.revision,
    updatedAt: ctx.result.stateUpdatedAt,
    payload: ctx.result.payload,
  };
}
