import { util } from "@aws-appsync/utils";

const ALLOWED_TYPES = [
  "analytics.session.started",
  "analytics.step.started",
  "analytics.hint.used",
  "analytics.attempt.recorded",
  "analytics.step.completed",
  "analytics.session.completed",
];

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    util.error(`${name} is required`, "TelemetryEventError");
  }
  return value;
}

function mode(value) {
  if (value !== "explore" && value !== "guided" && value !== "challenge") {
    util.error("Unsupported training mode", "TelemetryEventError");
  }
  return value;
}

function optionalDuration(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || value < 0) {
    util.error("durationMs must be non-negative", "TelemetryEventError");
  }
  return value;
}

function sanitizedPayload(event) {
  const payload = event.payload;
  if (!payload || typeof payload !== "object" || typeof payload.length === "number") {
    util.error("Telemetry payload must be an object", "TelemetryEventError");
  }

  const result = {
    scenarioId: requiredString(payload.scenarioId, "scenarioId"),
    mode: mode(payload.mode),
  };
  if (payload.stepId !== undefined && payload.stepId !== null) {
    result.stepId = requiredString(payload.stepId, "stepId");
  }
  if (payload.hintLevel !== undefined && payload.hintLevel !== null) {
    if (typeof payload.hintLevel !== "number" || payload.hintLevel < 1 || payload.hintLevel > 3) {
      util.error("hintLevel must be between 1 and 3", "TelemetryEventError");
    }
    result.hintLevel = payload.hintLevel;
  }
  if (payload.outcome !== undefined && payload.outcome !== null) {
    if (
      payload.outcome !== "pass" &&
      payload.outcome !== "fail" &&
      payload.outcome !== "near-miss"
    ) {
      util.error("Unsupported attempt outcome", "TelemetryEventError");
    }
    result.outcome = payload.outcome;
  }
  const durationMs = optionalDuration(payload.durationMs);
  if (durationMs !== null) result.durationMs = durationMs;
  return result;
}

function requiresStep(eventType) {
  return (
    eventType === "analytics.step.started" ||
    eventType === "analytics.hint.used" ||
    eventType === "analytics.attempt.recorded" ||
    eventType === "analytics.step.completed"
  );
}

export function request(ctx) {
  const subject = ctx.stash.telemetrySubject;
  if (!subject || typeof subject.userId !== "string" || typeof subject.tenantId !== "string") {
    util.unauthorized();
  }

  const event = ctx.args.event;
  if (!event || typeof event !== "object" || typeof event.length === "number") {
    util.error("Telemetry event must be an object", "TelemetryEventError");
  }
  const eventId = requiredString(event.id, "event.id");
  const eventType = requiredString(event.type, "event.type");
  if (!ALLOWED_TYPES.includes(eventType)) {
    util.error("Unsupported telemetry event type", "TelemetryEventError");
  }
  if (event.source !== "learning-analytics") {
    util.error("Unsupported telemetry event source", "TelemetryEventError");
  }
  const occurredAt = requiredString(event.timestamp, "event.timestamp");
  const sessionId = requiredString(event.sessionId, "event.sessionId");
  const payload = sanitizedPayload(event);
  if (requiresStep(eventType) && typeof payload.stepId !== "string") {
    util.error("stepId is required for this telemetry event", "TelemetryEventError");
  }

  const pseudonymizationMode = ctx.stash.telemetryPseudonymizationMode;
  const subjectKey =
    pseudonymizationMode === "ANONYMOUS"
      ? "anonymous:v1"
      : `session:v1:${util.base64Encode(sessionId)}`;
  const tenantScenarioKey = [
    "telemetry-scenario:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(payload.scenarioId),
  ].join(".");
  const id = [
    "telemetry-event:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(eventId),
  ].join(".");

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues({
      tenantId: subject.tenantId,
      tenantScenarioKey,
      subjectKey,
      eventId,
      source: event.source,
      eventType,
      occurredAt,
      receivedAtEpochSeconds: util.time.nowEpochSeconds(),
      sessionId,
      scenarioId: payload.scenarioId,
      mode: payload.mode,
      stepId: payload.stepId || null,
      payload,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return true;
}
