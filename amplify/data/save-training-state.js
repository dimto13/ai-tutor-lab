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

function itemId(subject, scenarioId, mode) {
  return [
    "session",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
    util.base64Encode(scenarioId),
    mode,
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
    scenarioId: ctx.args.scenarioId,
    mode: ctx.args.mode,
    schemaVersion: ctx.args.schemaVersion,
    revision,
    stateUpdatedAt: util.time.nowEpochMilliSeconds(),
    payload: ctx.args.payload,
  };

  const condition =
    expectedRevision === null || expectedRevision === undefined
      ? { expression: "attribute_not_exists(id)" }
      : util.transform.toDynamoDBConditionExpression({ revision: { eq: expectedRevision } });

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({
      id: itemId(subject, ctx.args.scenarioId, ctx.args.mode),
    }),
    attributeValues: util.dynamodb.toMapValues(values),
    condition,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return {
    tenantId: ctx.result.tenantId,
    userId: ctx.result.userId,
    scenarioId: ctx.result.scenarioId,
    mode: ctx.result.mode,
    schemaVersion: ctx.result.schemaVersion,
    revision: ctx.result.revision,
    updatedAt: ctx.result.stateUpdatedAt,
    payload: ctx.result.payload,
  };
}
