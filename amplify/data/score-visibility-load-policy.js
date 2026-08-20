import { util } from "@aws-appsync/utils";

const KNOWN_ROLE_GROUPS = ["role:learner", "role:author", "role:trainer", "role:tenant_admin"];

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  let tenantId = null;
  let role = null;

  for (const group of groups) {
    if (typeof group === "string") {
      if (group.startsWith("tenant:")) {
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
      } else if (group.startsWith("role:")) {
        if (KNOWN_ROLE_GROUPS.indexOf(group) === -1) {
          util.error("Unknown application role membership", "RoleMembershipError");
        }
        if (group === "role:tenant_admin") role = "tenant_admin";
        else if (group === "role:trainer" && role === null) role = "trainer";
      }
    }
  }

  if (tenantId === null) {
    util.error("Tenant membership is required for score reporting", "TenantMembershipError");
  }
  if (role === null) util.unauthorized();

  return { userId: identity.sub, tenantId, role };
}

function policyId(tenantId) {
  return `score-visibility-policy:v1:${util.base64Encode(tenantId)}`;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePolicy(row, tenantId) {
  if (!row) {
    return {
      visibility: "private",
      leaderboardsEnabled: false,
      namedApprovalConfirmed: false,
      namedApprovalReference: null,
      namedApprovalConfirmedBy: null,
      namedApprovalConfirmedAt: null,
      updatedAt: null,
    };
  }

  if (row.tenantId !== tenantId) {
    util.error("Score visibility policy escaped authenticated tenant scope", "ScoreVisibilityScopeError");
  }
  if (
    row.visibility !== "private" &&
    row.visibility !== "aggregate" &&
    row.visibility !== "named"
  ) {
    util.error("Persisted score visibility level is invalid", "ScoreVisibilityPolicyError");
  }
  if (typeof row.leaderboardsEnabled !== "boolean") {
    util.error("Persisted leaderboard policy is invalid", "ScoreVisibilityPolicyError");
  }

  const hasApproval =
    hasText(row.namedApprovalReference) &&
    hasText(row.namedApprovalConfirmedBy) &&
    typeof row.namedApprovalConfirmedAt === "number" &&
    Number.isFinite(row.namedApprovalConfirmedAt) &&
    row.namedApprovalConfirmedAt > 0;

  if (row.visibility !== "named") {
    if (row.leaderboardsEnabled || hasApproval) {
      util.error("Persisted score visibility policy is contradictory", "ScoreVisibilityPolicyError");
    }
  } else if (!hasApproval) {
    util.error(
      "Named score visibility is missing documented approval",
      "ScoreVisibilityPolicyError",
    );
  }

  return {
    visibility: row.visibility,
    leaderboardsEnabled: row.leaderboardsEnabled,
    namedApprovalConfirmed: row.visibility === "named" && hasApproval,
    namedApprovalReference: row.visibility === "named" ? row.namedApprovalReference : null,
    namedApprovalConfirmedBy: row.visibility === "named" ? row.namedApprovalConfirmedBy : null,
    namedApprovalConfirmedAt: row.visibility === "named" ? row.namedApprovalConfirmedAt : null,
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : null,
  };
}

export function request(ctx) {
  const subject = caller(ctx);
  ctx.stash.scoreVisibilitySubject = subject;
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: policyId(subject.tenantId) }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const subject = ctx.stash.scoreVisibilitySubject;
  if (!subject || typeof subject.tenantId !== "string") {
    util.error("Score visibility subject is missing", "ScoreVisibilityContextError");
  }
  const policy = normalizePolicy(ctx.result, subject.tenantId);
  ctx.stash.scoreVisibilityPolicy = policy;
  return policy;
}
