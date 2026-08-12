import { util } from "@aws-appsync/utils";

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  let tenantId = null;
  // The APPSYNC_JS runtime rejects `continue`, so the tenant group is selected by a
  // positive condition instead of skipping non-matching entries.
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

function itemId(subject) {
  return [
    "preferences",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

export function request(ctx) {
  const subject = caller(ctx);
  const expectedRevision = ctx.args.expectedRevision;
  const revision =
    expectedRevision === null || expectedRevision === undefined ? 1 : expectedRevision + 1;
  const values = {
    tenantId: subject.tenantId,
    userId: subject.userId,
    language: ctx.args.language ?? null,
    preferredTrainingMode: ctx.args.preferredTrainingMode ?? null,
    weeklyGoalMinutes: ctx.args.weeklyGoalMinutes ?? null,
    accessibility: ctx.args.accessibility ?? null,
    preferencesVersion: revision,
    stateUpdatedAt: util.time.nowEpochMilliSeconds(),
  };

  const condition =
    expectedRevision === null || expectedRevision === undefined
      ? { expression: "attribute_not_exists(id)" }
      : util.transform.toDynamoDBConditionExpression({
          preferencesVersion: { eq: expectedRevision },
        });

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id: itemId(subject) }),
    attributeValues: util.dynamodb.toMapValues(values),
    condition,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return {
    tenantId: ctx.result.tenantId,
    userId: ctx.result.userId,
    language: ctx.result.language,
    preferredTrainingMode: ctx.result.preferredTrainingMode,
    weeklyGoalMinutes: ctx.result.weeklyGoalMinutes,
    accessibility: ctx.result.accessibility,
    revision: ctx.result.preferencesVersion,
    updatedAt: ctx.result.stateUpdatedAt,
  };
}
