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
  return { userId: identity.sub, tenantId: tenantId || `personal:${identity.sub}` };
}

function ownerKey(subject) {
  return [
    "telemetry-deletion-owner:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

export function request(ctx) {
  const subject = caller(ctx);
  ctx.stash.telemetryDeletionSubject = subject;
  return {
    operation: "Query",
    index: "telemetryDeletionByOwnerTime",
    query: {
      expression: "ownerKey = :ownerKey",
      expressionValues: util.dynamodb.toMapValues({ ":ownerKey": ownerKey(subject) }),
    },
    limit: 4,
    scanIndexForward: true,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const subject = ctx.stash.telemetryDeletionSubject;
  const expectedOwnerKey = ownerKey(subject);
  const items = ctx.result && ctx.result.items ? ctx.result.items : [];
  const targets = [];
  for (const item of items) {
    if (item.tenantId !== subject.tenantId || item.ownerKey !== expectedOwnerKey) {
      util.error(
        "Telemetry deletion query escaped authenticated owner scope",
        "TelemetryScopeError",
      );
    }
    if (typeof item.id !== "string" || typeof item.rawEventId !== "string") {
      util.error("Telemetry deletion pointer is invalid", "TelemetryDeletionError");
    }
    targets.push({ pointerId: item.id, rawEventId: item.rawEventId });
  }
  ctx.stash.telemetryDeletionTargets = targets;
  ctx.stash.telemetryDeletionHasMore = Boolean(ctx.result && ctx.result.nextToken);
  ctx.stash.telemetryDeletionCount = 0;
  return null;
}
