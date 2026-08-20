import assert from "node:assert/strict";
import test from "node:test";
import {
  canExposeAggregateScores,
  canExposeNamedLeaderboard,
  DEFAULT_TENANT_SCORE_VISIBILITY_POLICY,
  effectiveTenantScoreVisibilityPolicy,
  MIN_AGGREGATE_SCORE_COHORT,
  validateTenantScoreVisibilityPolicy,
} from "../src/scoreVisibility.ts";

test("a missing tenant policy is private with leaderboards disabled", () => {
  assert.deepEqual(effectiveTenantScoreVisibilityPolicy(null), {
    visibility: "private",
    leaderboardsEnabled: false,
    namedApproval: null,
  });
  assert.equal(DEFAULT_TENANT_SCORE_VISIBILITY_POLICY.visibility, "private");
});

test("aggregate visibility suppresses cohorts below five", () => {
  assert.equal(MIN_AGGREGATE_SCORE_COHORT, 5);
  assert.equal(canExposeAggregateScores(4), false);
});

test("aggregate visibility permits a cohort of exactly five", () => {
  assert.equal(canExposeAggregateScores(5), true);
});

test("named visibility fails closed without documented approval", () => {
  assert.throws(
    () =>
      validateTenantScoreVisibilityPolicy({
        visibility: "named",
        leaderboardsEnabled: true,
        namedApproval: null,
      }),
    /explicit documented approval/,
  );
});

test("named leaderboard requires approved policy and tenant admin role", () => {
  const policy = validateTenantScoreVisibilityPolicy({
    visibility: "named",
    leaderboardsEnabled: true,
    namedApproval: {
      reference: "works-agreement:2026-08-20",
      confirmedBy: "admin-subject",
      confirmedAt: 1_787_176_800_000,
    },
  });

  assert.equal(canExposeNamedLeaderboard(policy, "tenant_admin"), true);
  assert.equal(canExposeNamedLeaderboard(policy, "trainer"), false);
});

test("non-named visibility cannot enable leaderboards or retain named approval", () => {
  assert.throws(
    () =>
      validateTenantScoreVisibilityPolicy({
        visibility: "aggregate",
        leaderboardsEnabled: true,
        namedApproval: null,
      }),
    /only be enabled for named visibility/,
  );

  assert.throws(
    () =>
      validateTenantScoreVisibilityPolicy({
        visibility: "private",
        leaderboardsEnabled: false,
        namedApproval: {
          reference: "stale-approval",
          confirmedBy: "admin-subject",
          confirmedAt: 1,
        },
      }),
    /only valid for named visibility/,
  );
});
