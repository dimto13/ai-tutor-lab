import { util } from "@aws-appsync/utils";

const SECONDS_PER_DAY = 24 * 60 * 60;

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    util.error(`${name} is required`, "TelemetryDeletionError");
  }
  return value;
}

function ownerKey(subject) {
  return [
    "telemetry-deletion-owner:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

function rawEventId(tenantId, eventId) {
  return [
    "telemetry-event:v1",
    util.base64Encode(tenantId),
    util.base64Encode(eventId),
  ].join(".");
}

export function request(ctx) {
  const subject = ctx.stash.telemetrySubject;
  if (!subject || typeof subject.userId !== "string" || typeof subject.tenantId !== "string") {
    util.unauthorized();
  }
  const retentionDays = ctx.stash.telemetryRawEventRetentionDays;
  if (typeof retentionDays !== "number" || retentionDays < 1 || retentionDays % 1 !== 0) {
    util.error("Telemetry retention policy is invalid", "TelemetryPolicyError");
  }

  const event = ctx.args.event;
  if (!event || typeof event !== "object" || typeof event.length === "number") {
    util.error("Telemetry event must be an object", "TelemetryDeletionError");
  }
  const eventId = requiredString(event.id, "event.id");
  const occurredAt = util.time.parseISO8601ToEpochMilliSeconds(
    requiredString(event.timestamp, "event.timestamp"),
  );
  const rawId = rawEventId(subject.tenantId, eventId);
  const receivedAtEpochSeconds = util.time.nowEpochSeconds();
  const expiresAtEpochSeconds = receivedAtEpochSeconds + retentionDays * SECONDS_PER_DAY;

  const id = [
    "telemetry-deletion-pointer:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(rawId),
  ].join(".");
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues({
      tenantId: subject.tenantId,
      ownerKey: ownerKey(subject),
      rawEventId: rawId,
      occurredAt,
      expiresAtEpochSeconds,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return true;
}
