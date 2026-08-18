import { util } from "@aws-appsync/utils";

function ownerKey(subject) {
  return [
    "telemetry-deletion-owner:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

export function request(ctx) {
  const subject = ctx.stash.telemetrySubject;
  const rawEventId = ctx.stash.telemetryRawEventId;
  const occurredAt = ctx.stash.telemetryRawEventOccurredAt;
  const expiresAtEpochSeconds = ctx.stash.telemetryRawEventExpiresAtEpochSeconds;
  if (!subject || typeof subject.userId !== "string" || typeof subject.tenantId !== "string") {
    util.unauthorized();
  }
  if (
    typeof rawEventId !== "string" ||
    typeof occurredAt !== "number" ||
    typeof expiresAtEpochSeconds !== "number"
  ) {
    util.error("Telemetry deletion lifecycle state is invalid", "TelemetryDeletionError");
  }

  const id = [
    "telemetry-deletion-pointer:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(rawEventId),
  ].join(".");
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues({
      tenantId: subject.tenantId,
      ownerKey: ownerKey(subject),
      rawEventId,
      occurredAt,
      expiresAtEpochSeconds,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return true;
}
