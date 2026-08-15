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

function runOwnerKey(subject) {
  return [
    "run-owner:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

export function request(ctx) {
  const subject = caller(ctx);
  const requestedLimit = ctx.args.limit;
  const limit =
    typeof requestedLimit === "number" && requestedLimit >= 1 && requestedLimit <= 100
      ? Math.floor(requestedLimit)
      : 50;

  ctx.stash.runSubject = subject;
  return {
    operation: "Query",
    index: "scenarioRunsByOwnerTime",
    query: {
      expression: "ownerKey = :ownerKey",
      expressionValues: util.dynamodb.toMapValues({
        ":ownerKey": runOwnerKey(subject),
      }),
    },
    limit,
    scanIndexForward: false,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const subject = ctx.stash.runSubject;
  const items = ctx.result && ctx.result.items ? ctx.result.items : [];
  const runs = [];

  for (const item of items) {
    if (item.tenantId !== subject.tenantId || item.userId !== subject.userId) {
      util.error(
        "Scenario run query returned an item outside the authenticated owner scope",
        "RunScopeError",
      );
    }

    runs.push({
      id: item.id,
      tenantId: item.tenantId,
      userId: item.userId,
      scenarioId: item.scenarioId,
      scenarioVersion: item.scenarioVersion,
      sessionId: item.sessionId,
      mode: item.mode,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      durationMs: item.durationMs,
      estimatedMinutes: item.estimatedMinutes,
      fastRunThresholdRatio: item.fastRunThresholdRatio,
      fastRunThresholdMs: item.fastRunThresholdMs,
      evidenceStatus: item.evidenceStatus,
      evidenceEligible: item.evidenceEligible,
      sourceRevision: item.sourceRevision,
    });
  }

  return runs;
}
