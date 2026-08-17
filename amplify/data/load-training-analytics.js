import { util } from "@aws-appsync/utils";

const ABANDONMENT_AFTER_SECONDS = 15 * 60;
const MIN_REPORTING_COHORT = 3;

function callerTenant(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  if (!groups.includes("role:trainer") && !groups.includes("role:tenant_admin")) {
    util.unauthorized();
  }

  let tenantId = null;
  for (const group of groups) {
    if (typeof group === "string" && group.startsWith("tenant:")) {
      const candidate = group.slice("tenant:".length);
      if (candidate.length === 0) util.error("Invalid tenant membership", "TenantMembershipError");
      if (tenantId !== null && tenantId !== candidate) {
        util.error(
          "Multiple tenant memberships require explicit tenant selection",
          "TenantMembershipError",
        );
      }
      tenantId = candidate;
    }
  }
  return tenantId || `personal:${identity.sub}`;
}

function tenantScenarioKey(tenantId, scenarioId) {
  return [
    "telemetry-scenario:v1",
    util.base64Encode(tenantId),
    util.base64Encode(scenarioId),
  ].join(".");
}

function requireScenarioId(ctx) {
  if (typeof ctx.args.scenarioId !== "string" || ctx.args.scenarioId.length === 0) {
    util.error("scenarioId is required", "TrainingAnalyticsError");
  }
  return ctx.args.scenarioId;
}

function referenceEpochSeconds(to) {
  const now = util.time.nowEpochSeconds();
  if (!to) return now;
  const requested = util.time.epochMilliSecondsToSeconds(
    util.time.parseISO8601ToEpochMilliSeconds(to),
  );
  return requested < now ? requested : now;
}

export function request(ctx) {
  const tenantId = callerTenant(ctx);
  const scenarioId = requireScenarioId(ctx);
  const from = ctx.args.from;
  const to = ctx.args.to;
  if (from !== undefined && from !== null && (typeof from !== "string" || from.length === 0)) {
    util.error("from must be an ISO timestamp", "TrainingAnalyticsError");
  }
  if (to !== undefined && to !== null && (typeof to !== "string" || to.length === 0)) {
    util.error("to must be an ISO timestamp", "TrainingAnalyticsError");
  }
  if (from && to && from > to) util.error("from must be before to", "TrainingAnalyticsError");

  ctx.stash.analyticsTenantId = tenantId;
  ctx.stash.analyticsScenarioId = scenarioId;
  ctx.stash.analyticsReferenceEpochSeconds = referenceEpochSeconds(to);

  const values = { ":tenantScenarioKey": tenantScenarioKey(tenantId, scenarioId) };
  let expression = "tenantScenarioKey = :tenantScenarioKey";
  if (from && to) {
    expression += " AND occurredAt BETWEEN :from AND :to";
    values[":from"] = from;
    values[":to"] = to;
  } else if (from) {
    expression += " AND occurredAt >= :from";
    values[":from"] = from;
  } else if (to) {
    expression += " AND occurredAt <= :to";
    values[":to"] = to;
  }

  return {
    operation: "Query",
    index: "telemetryByTenantScenarioTime",
    query: {
      expression,
      expressionValues: util.dynamodb.toMapValues(values),
    },
    limit: 1000,
    scanIndexForward: true,
  };
}

function stepMetric(steps, stepId) {
  let metric = steps[stepId];
  if (!metric) {
    metric = {
      stepId,
      abandonmentCount: 0,
      hintUsageCount: 0,
      durationTotalMs: 0,
      durationCount: 0,
      failedAttemptCount: 0,
      failurePatterns: {},
    };
    steps[stepId] = metric;
  }
  return metric;
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  if (ctx.result && ctx.result.nextToken) {
    util.error(
      "Analytics range exceeds the exact aggregation limit; narrow the from/to window",
      "TrainingAnalyticsRangeTooLarge",
    );
  }

  const tenantId = ctx.stash.analyticsTenantId;
  const scenarioId = ctx.stash.analyticsScenarioId;
  const referenceTime = ctx.stash.analyticsReferenceEpochSeconds;
  const items = ctx.result && ctx.result.items ? ctx.result.items : [];
  const sessions = {};
  const steps = {};

  for (const item of items) {
    if (item.tenantId !== tenantId || item.scenarioId !== scenarioId) {
      util.error("Telemetry query escaped authenticated tenant scope", "TrainingAnalyticsScopeError");
    }

    const sessionId = item.sessionId;
    if (typeof sessionId !== "string" || sessionId.length === 0) continue;
    let session = sessions[sessionId];
    if (!session) {
      session = { started: false, completed: false, lastStepId: null, lastReceivedAt: 0 };
      sessions[sessionId] = session;
    }
    if (
      typeof item.receivedAtEpochSeconds === "number" &&
      item.receivedAtEpochSeconds > session.lastReceivedAt
    ) {
      session.lastReceivedAt = item.receivedAtEpochSeconds;
    }

    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const stepId = typeof item.stepId === "string" && item.stepId.length > 0 ? item.stepId : null;

    if (item.eventType === "analytics.session.started") session.started = true;
    if (item.eventType === "analytics.session.completed") session.completed = true;
    if (item.eventType === "analytics.step.started" && stepId) {
      session.lastStepId = stepId;
      stepMetric(steps, stepId);
    }
    if (item.eventType === "analytics.hint.used" && stepId) {
      stepMetric(steps, stepId).hintUsageCount += 1;
    }
    if (item.eventType === "analytics.attempt.recorded" && stepId && payload.outcome !== "pass") {
      const metric = stepMetric(steps, stepId);
      const pattern =
        payload.outcome === "fail" || payload.outcome === "near-miss" ? payload.outcome : "unknown";
      metric.failedAttemptCount += 1;
      metric.failurePatterns[pattern] = (metric.failurePatterns[pattern] || 0) + 1;
    }
    if (item.eventType === "analytics.step.completed" && stepId) {
      const metric = stepMetric(steps, stepId);
      if (typeof payload.durationMs === "number" && payload.durationMs >= 0) {
        metric.durationTotalMs += payload.durationMs;
        metric.durationCount += 1;
      }
    }
  }

  let sessionsStarted = 0;
  let sessionsCompleted = 0;
  let abandonmentCount = 0;
  for (const sessionId of Object.keys(sessions)) {
    const session = sessions[sessionId];
    if (!session.started) continue;
    sessionsStarted += 1;
    if (session.completed) {
      sessionsCompleted += 1;
      continue;
    }
    if (
      session.lastReceivedAt > 0 &&
      referenceTime - session.lastReceivedAt >= ABANDONMENT_AFTER_SECONDS
    ) {
      abandonmentCount += 1;
      if (session.lastStepId) stepMetric(steps, session.lastStepId).abandonmentCount += 1;
    }
  }

  const cohortSuppressed = sessionsStarted < MIN_REPORTING_COHORT;
  const resultSteps = [];
  if (!cohortSuppressed) {
    for (const stepId of Object.keys(steps)) {
      const metric = steps[stepId];
      const patterns = [];
      for (const pattern of Object.keys(metric.failurePatterns)) {
        patterns.push({ pattern, count: metric.failurePatterns[pattern] });
      }
      resultSteps.push({
        stepId,
        abandonmentCount: metric.abandonmentCount,
        hintUsageCount: metric.hintUsageCount,
        averageDurationMs:
          metric.durationCount === 0 ? null : metric.durationTotalMs / metric.durationCount,
        failedAttemptCount: metric.failedAttemptCount,
        failurePatterns: patterns,
      });
    }
  }

  return {
    scenarioId,
    sessionsStarted,
    sessionsCompleted: cohortSuppressed ? 0 : sessionsCompleted,
    abandonmentCount: cohortSuppressed ? 0 : abandonmentCount,
    cohortSuppressed,
    truncated: false,
    steps: resultSteps,
  };
}