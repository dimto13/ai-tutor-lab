import { util } from "@aws-appsync/utils";

const MIN_REPORTING_COHORT = 5;

function optionalEpochMillis(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || value < 0) {
    util.error(`${name} must be non-negative epoch milliseconds`, "TrainingAnalyticsError");
  }
  return value;
}

function reportingContext(ctx) {
  const subject = ctx.stash.scoreVisibilitySubject;
  const policy = ctx.stash.scoreVisibilityPolicy;
  if (!subject || typeof subject.tenantId !== "string" || !policy) {
    util.error("Reporting authority context is missing", "TrainingAnalyticsContextError");
  }
  return { subject, policy };
}

export function request(ctx) {
  const { subject, policy } = reportingContext(ctx);
  const scenarioId = ctx.args.scenarioId;
  if (typeof scenarioId !== "string" || scenarioId.length === 0) {
    util.error("scenarioId is required", "TrainingAnalyticsError");
  }

  const from = optionalEpochMillis(ctx.args.from, "from");
  const to = optionalEpochMillis(ctx.args.to, "to");
  if (from !== null && to !== null && from > to) {
    util.error("from must be before to", "TrainingAnalyticsError");
  }

  ctx.stash.analyticsTenantId = subject.tenantId;
  ctx.stash.analyticsScenarioId = scenarioId;
  ctx.stash.analyticsCohortSuppressed = policy.visibility === "private";
  ctx.stash.analyticsCohortSize = null;

  const values = { ":tenantId": subject.tenantId };
  let expression = "tenantId = :tenantId";
  if (from !== null && to !== null) {
    expression += " AND occurredAt BETWEEN :from AND :to";
    values[":from"] = from;
    values[":to"] = to;
  } else if (from !== null) {
    expression += " AND occurredAt >= :from";
    values[":from"] = from;
  } else if (to !== null) {
    expression += " AND occurredAt <= :to";
    values[":to"] = to;
  }

  return {
    operation: "Query",
    index: "scoreEventsByTenantTime",
    query: {
      expression,
      expressionValues: util.dynamodb.toMapValues(values),
    },
    limit: 1000,
    scanIndexForward: false,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  if (ctx.result && ctx.result.nextToken) {
    util.error(
      "Reporting cohort evidence exceeds the exact evaluation window; narrow the from/to range",
      "TrainingAnalyticsCohortWindowTooLarge",
    );
  }

  const { subject, policy } = reportingContext(ctx);
  if (policy.visibility === "private") {
    ctx.stash.analyticsCohortSuppressed = true;
    ctx.stash.analyticsCohortSize = null;
    return { cohortSuppressed: true, cohortSize: null };
  }

  const scenarioId = ctx.stash.analyticsScenarioId;
  const items = ctx.result && ctx.result.items ? ctx.result.items : [];
  const users = {};

  for (const item of items) {
    if (item.tenantId !== subject.tenantId) {
      util.error(
        "Reporting evidence escaped authenticated tenant scope",
        "TrainingAnalyticsScopeError",
      );
    }
    if (item.scenarioId !== scenarioId) continue;
    if (typeof item.userId !== "string" || item.userId.length === 0) {
      util.error("Reporting evidence is missing its owner", "TrainingAnalyticsEvidenceError");
    }
    users[item.userId] = true;
  }

  const cohortSize = Object.keys(users).length;
  const cohortSuppressed = cohortSize < MIN_REPORTING_COHORT;
  ctx.stash.analyticsCohortSuppressed = cohortSuppressed;
  ctx.stash.analyticsCohortSize = cohortSuppressed ? null : cohortSize;

  return {
    cohortSuppressed,
    cohortSize: cohortSuppressed ? null : cohortSize,
  };
}
