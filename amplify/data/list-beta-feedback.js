import { util } from "@aws-appsync/utils";

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) util.unauthorized();
  const groups = identity.groups || [];
  const isAdmin = groups.includes("role:tenant_admin") || groups.includes("role:owner");
  if (!isAdmin) util.unauthorized();
  let tenantId = null;
  for (const group of groups) {
    if (typeof group !== "string" || !group.startsWith("tenant:")) continue;
    const candidate = group.slice("tenant:".length);
    if (!candidate) util.error("Invalid tenant membership", "TenantMembershipError");
    if (tenantId !== null && tenantId !== candidate) {
      util.error("Multiple tenant memberships require explicit tenant selection", "TenantMembershipError");
    }
    tenantId = candidate;
  }
  return { tenantId: tenantId || `personal:${identity.sub}` };
}

export function request(ctx) {
  const subject = caller(ctx);
  const limit = ctx.args.limit == null ? 100 : ctx.args.limit;
  if (typeof limit !== "number" || limit < 1 || limit > 250 || limit % 1 !== 0) {
    util.error("limit must be an integer between 1 and 250", "FeedbackValidationError");
  }
  ctx.stash.feedbackTenantId = subject.tenantId;
  return {
    operation: "Query",
    index: "betaFeedbackByTenantTime",
    query: { expression: "tenantId = :tenantId", expressionValues: util.dynamodb.toMapValues({ ":tenantId": subject.tenantId }) },
    limit,
    scanIndexForward: false,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const tenantId = ctx.stash.feedbackTenantId;
  const items = Array.isArray(ctx.result?.items) ? ctx.result.items : [];
  // Defense in depth: never return a row whose tenant does not match the server-derived tenant.
  return items.filter((item) => item && item.tenantId === tenantId);
}
