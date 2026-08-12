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

function itemId(subject) {
  return ["profile", util.base64Encode(subject.tenantId), util.base64Encode(subject.userId)].join(
    ".",
  );
}

export function request(ctx) {
  const subject = caller(ctx);
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: itemId(subject) }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (!ctx.result) return null;
  return {
    tenantId: ctx.result.tenantId,
    userId: ctx.result.userId,
    displayName: ctx.result.displayName,
    email: ctx.result.email,
    revision: ctx.result.profileVersion,
  };
}
