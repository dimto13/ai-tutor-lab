import { util } from "@aws-appsync/utils";

const KNOWN_ROLE_GROUPS = ["role:learner", "role:author", "role:trainer", "role:tenant_admin"];

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  let tenantId = null;
  let tenantAdmin = false;

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
        if (group === "role:tenant_admin") tenantAdmin = true;
      }
    }
  }

  if (!tenantAdmin) util.unauthorized();
  if (tenantId === null) {
    util.error(
      "Tenant membership is required for score policy administration",
      "TenantMembershipError",
    );
  }
  return { userId: identity.sub, tenantId };
}

function policyId(tenantId) {
  return `score-visibility-policy:v1:${util.base64Encode(tenantId)}`;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function request(ctx) {
  const subject = caller(ctx);
  const visibility = ctx.args.visibility;
  const leaderboardsEnabled = ctx.args.leaderboardsEnabled;
  const approvalConfirmed = ctx.args.namedApprovalConfirmed === true;
  const approvalReference = ctx.args.namedApprovalReference;

  if (visibility !== "private" && visibility !== "aggregate" && visibility !== "named") {
    util.error("Unsupported score visibility level", "ScoreVisibilityPolicyError");
  }
  if (typeof leaderboardsEnabled !== "boolean") {
    util.error("leaderboardsEnabled must be explicit", "ScoreVisibilityPolicyError");
  }

  let namedApprovalReference = null;
  let namedApprovalConfirmedBy = null;
  let namedApprovalConfirmedAt = null;

  if (visibility === "named") {
    if (!approvalConfirmed || !hasText(approvalReference)) {
      util.error(
        "Named score visibility requires explicit documented approval",
        "ScoreVisibilityApprovalRequired",
      );
    }
    namedApprovalReference = approvalReference.trim();
    namedApprovalConfirmedBy = subject.userId;
    namedApprovalConfirmedAt = util.time.nowEpochMilliSeconds();
  } else {
    if (leaderboardsEnabled) {
      util.error(
        "Leaderboards can only be enabled for named visibility",
        "ScoreVisibilityPolicyError",
      );
    }
    if (approvalConfirmed || hasText(approvalReference)) {
      util.error(
        "Named approval cannot be attached to non-named visibility",
        "ScoreVisibilityPolicyError",
      );
    }
  }

  const updatedAt = util.time.nowEpochMilliSeconds();
  const savedPolicy = {
    visibility,
    leaderboardsEnabled,
    namedApprovalConfirmed: visibility === "named",
    namedApprovalReference,
    namedApprovalConfirmedBy,
    namedApprovalConfirmedAt,
    updatedAt,
  };
  ctx.stash.scoreVisibilitySavedPolicy = savedPolicy;

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id: policyId(subject.tenantId) }),
    attributeValues: util.dynamodb.toMapValues({
      tenantId: subject.tenantId,
      visibility,
      leaderboardsEnabled,
      namedApprovalReference,
      namedApprovalConfirmedBy,
      namedApprovalConfirmedAt,
      updatedAt,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const policy = ctx.stash.scoreVisibilitySavedPolicy;
  if (!policy) {
    util.error("Score visibility policy write lost server context", "ScoreVisibilityContextError");
  }
  return policy;
}
