export const SCORE_VISIBILITY_LEVELS = ["private", "aggregate", "named"] as const;
export type ScoreVisibilityLevel = (typeof SCORE_VISIBILITY_LEVELS)[number];

export const MIN_AGGREGATE_SCORE_COHORT = 5;

export type ScoreReportingRole = "trainer" | "tenant_admin";

export interface NamedScoreVisibilityApproval {
  reference: string;
  confirmedBy: string;
  confirmedAt: number;
}

export interface TenantScoreVisibilityPolicy {
  visibility: ScoreVisibilityLevel;
  leaderboardsEnabled: boolean;
  namedApproval: NamedScoreVisibilityApproval | null;
}

export const DEFAULT_TENANT_SCORE_VISIBILITY_POLICY: TenantScoreVisibilityPolicy = Object.freeze({
  visibility: "private",
  leaderboardsEnabled: false,
  namedApproval: null,
});

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isVisibilityLevel(value: string): value is ScoreVisibilityLevel {
  return SCORE_VISIBILITY_LEVELS.includes(value as ScoreVisibilityLevel);
}

export function validateTenantScoreVisibilityPolicy(
  policy: TenantScoreVisibilityPolicy,
): TenantScoreVisibilityPolicy {
  if (!isVisibilityLevel(policy.visibility)) {
    throw new Error(`Unsupported score visibility level: ${String(policy.visibility)}`);
  }
  if (typeof policy.leaderboardsEnabled !== "boolean") {
    throw new Error("leaderboardsEnabled must be boolean");
  }

  if (policy.visibility !== "named") {
    if (policy.leaderboardsEnabled) {
      throw new Error("leaderboards can only be enabled for named visibility");
    }
    if (policy.namedApproval !== null) {
      throw new Error("named approval is only valid for named visibility");
    }
    return policy;
  }

  const approval = policy.namedApproval;
  if (
    approval === null ||
    !hasText(approval.reference) ||
    !hasText(approval.confirmedBy) ||
    !Number.isFinite(approval.confirmedAt) ||
    approval.confirmedAt <= 0
  ) {
    throw new Error("named visibility requires an explicit documented approval");
  }

  return policy;
}

export function effectiveTenantScoreVisibilityPolicy(
  policy: TenantScoreVisibilityPolicy | null | undefined,
): TenantScoreVisibilityPolicy {
  if (policy === null || policy === undefined) {
    return DEFAULT_TENANT_SCORE_VISIBILITY_POLICY;
  }
  return validateTenantScoreVisibilityPolicy(policy);
}

export function canExposeAggregateScores(cohortSize: number): boolean {
  if (!Number.isInteger(cohortSize) || cohortSize < 0) {
    throw new Error("cohortSize must be a non-negative integer");
  }
  return cohortSize >= MIN_AGGREGATE_SCORE_COHORT;
}

export function canExposeNamedLeaderboard(
  policy: TenantScoreVisibilityPolicy,
  role: ScoreReportingRole,
): boolean {
  const effective = validateTenantScoreVisibilityPolicy(policy);
  return (
    effective.visibility === "named" &&
    effective.leaderboardsEnabled &&
    effective.namedApproval !== null &&
    role === "tenant_admin"
  );
}
