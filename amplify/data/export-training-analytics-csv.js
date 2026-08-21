import { util } from "@aws-appsync/utils";

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function row(values) {
  return values.map(csvCell).join(",");
}

export function request(ctx) {
  const analytics = ctx.prev.result;
  if (!analytics || typeof analytics !== "object") {
    util.error("Analytics result is missing", "TrainingAnalyticsExportError");
  }
  if (analytics.cohortSuppressed === true) {
    util.error(
      "Reporting is unavailable below the minimum cohort or under a private visibility policy",
      "TrainingAnalyticsCohortSuppressed",
    );
  }
  return { payload: analytics };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const analytics = ctx.result;
  if (!analytics || typeof analytics !== "object" || analytics.cohortSuppressed === true) {
    util.error("Analytics export boundary was not satisfied", "TrainingAnalyticsExportError");
  }

  const lines = [
    row([
      "recordType",
      "scenarioId",
      "stepId",
      "cohortSize",
      "sessionsStarted",
      "sessionsCompleted",
      "completionRate",
      "abandonmentCount",
      "averageHintUsage",
      "averageDurationMs",
      "hintUsageCount",
      "failedAttemptCount",
    ]),
    row([
      "scenario",
      analytics.scenarioId,
      null,
      analytics.cohortSize,
      analytics.sessionsStarted,
      analytics.sessionsCompleted,
      analytics.completionRate,
      analytics.abandonmentCount,
      analytics.averageHintUsage,
      analytics.averageDurationMs,
      null,
      null,
    ]),
  ];

  const steps =
    analytics.steps && typeof analytics.steps.length === "number" ? analytics.steps : [];
  for (const step of steps) {
    lines.push(
      row([
        "step",
        analytics.scenarioId,
        step.stepId,
        analytics.cohortSize,
        null,
        null,
        null,
        step.abandonmentCount,
        null,
        step.averageDurationMs,
        step.hintUsageCount,
        step.failedAttemptCount,
      ]),
    );
  }

  return lines.join("\n");
}
