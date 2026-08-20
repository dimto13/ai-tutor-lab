import { util } from "@aws-appsync/utils";

const MIN_AGGREGATE_SCORE_COHORT = 5;

function emptyResult(policy, cohortSuppressed) {
  return {
    visibility: policy.visibility,
    leaderboardsEnabled: policy.leaderboardsEnabled,
    cohortSuppressed,
    cohortSize: null,
    totalPoints: null,
    averagePoints: null,
    entries: [],
  };
}

function roundPoints(value) {
  return Math.round(value * 100) / 100;
}

export function request(ctx) {
  const subject = ctx.stash.scoreVisibilitySubject;
  const policy = ctx.stash.scoreVisibilityPolicy;
  if (!subject || typeof subject.tenantId !== "string" || !policy) {
    util.error("Score reporting context is missing", "ScoreVisibilityContextError");
  }

  return {
    operation: "Query",
    index: "scoreEventsByTenantTime",
    query: {
      expression: "tenantId = :tenantId",
      expressionValues: util.dynamodb.toMapValues({ ":tenantId": subject.tenantId }),
    },
    limit: 1000,
    scanIndexForward: false,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  if (ctx.result && ctx.result.nextToken) {
    util.error(
      "Tenant score evidence exceeds the exact reporting window",
      "ScoreVisibilityEvidenceWindowError",
    );
  }

  const subject = ctx.stash.scoreVisibilitySubject;
  const policy = ctx.stash.scoreVisibilityPolicy;
  if (!subject || !policy) {
    util.error("Score reporting context is missing", "ScoreVisibilityContextError");
  }

  if (policy.visibility === "private") {
    return emptyResult(policy, true);
  }

  if (policy.visibility === "named") {
    if (
      policy.namedApprovalConfirmed !== true ||
      typeof policy.namedApprovalReference !== "string" ||
      policy.namedApprovalReference.trim().length === 0 ||
      typeof policy.namedApprovalConfirmedBy !== "string" ||
      policy.namedApprovalConfirmedBy.trim().length === 0 ||
      typeof policy.namedApprovalConfirmedAt !== "number" ||
      !Number.isFinite(policy.namedApprovalConfirmedAt) ||
      policy.namedApprovalConfirmedAt <= 0
    ) {
      util.error("Named score visibility is not approved", "ScoreVisibilityApprovalRequired");
    }
    if (subject.role !== "tenant_admin") util.unauthorized();
    if (policy.leaderboardsEnabled !== true) return emptyResult(policy, false);
  } else if (policy.visibility !== "aggregate") {
    util.error("Score visibility policy is invalid", "ScoreVisibilityPolicyError");
  }

  const items = ctx.result && ctx.result.items ? ctx.result.items : [];
  const pointsByUser = {};
  let totalPoints = 0;

  for (const item of items) {
    if (item.tenantId !== subject.tenantId) {
      util.error("Score query escaped authenticated tenant scope", "ScoreVisibilityScopeError");
    }
    if (typeof item.userId !== "string" || item.userId.length === 0) {
      util.error("Score event is missing its owner", "ScoreVisibilityEvidenceError");
    }
    if (typeof item.pointsDelta !== "number" || !Number.isFinite(item.pointsDelta)) {
      util.error("Score event contains invalid points", "ScoreVisibilityEvidenceError");
    }
    pointsByUser[item.userId] = (pointsByUser[item.userId] || 0) + item.pointsDelta;
    totalPoints += item.pointsDelta;
  }

  const userIds = Object.keys(pointsByUser);
  const cohortSize = userIds.length;

  if (policy.visibility === "aggregate") {
    if (cohortSize < MIN_AGGREGATE_SCORE_COHORT) {
      return emptyResult(policy, true);
    }
    return {
      visibility: "aggregate",
      leaderboardsEnabled: false,
      cohortSuppressed: false,
      cohortSize,
      totalPoints: roundPoints(totalPoints),
      averagePoints: roundPoints(totalPoints / cohortSize),
      entries: [],
    };
  }

  const entries = [];
  for (const userId of userIds) {
    const points = roundPoints(pointsByUser[userId]);
    let rank = 1;
    for (const otherUserId of userIds) {
      const otherPoints = roundPoints(pointsByUser[otherUserId]);
      if (otherPoints > points || (otherPoints === points && otherUserId < userId)) rank += 1;
    }
    entries.push({ userId, points, rank });
  }

  return {
    visibility: "named",
    leaderboardsEnabled: true,
    cohortSuppressed: false,
    cohortSize,
    totalPoints: roundPoints(totalPoints),
    averagePoints: cohortSize === 0 ? null : roundPoints(totalPoints / cohortSize),
    entries,
  };
}
