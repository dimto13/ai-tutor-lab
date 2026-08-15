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

function scoreOwnerKey(subject) {
  return [
    "score-owner:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

export function request(ctx) {
  const subject = caller(ctx);
  ctx.stash.skillSubject = subject;
  return {
    operation: "Query",
    index: "scoreEventsByOwnerTime",
    query: {
      expression: "ownerKey = :ownerKey",
      expressionValues: util.dynamodb.toMapValues({
        ":ownerKey": scoreOwnerKey(subject),
      }),
    },
    limit: 1000,
    scanIndexForward: false,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const subject = ctx.stash.skillSubject;
  const items = ctx.result && ctx.result.items ? ctx.result.items : [];

  for (const item of items) {
    if (item.tenantId !== subject.tenantId || item.userId !== subject.userId) {
      util.error(
        "Score query returned an item outside the authenticated owner scope",
        "SkillProfileScopeError",
      );
    }
  }

  ctx.stash.skillScoreEvents = items;
  return items;
}
