import { util } from "@aws-appsync/utils";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 6;
const ADMISSION_TTL_SECONDS = 120;

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  let tenantId = null;
  for (const group of groups) {
    if (typeof group === "string" && group.startsWith("tenant:")) {
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
    }
  }

  return { userId: identity.sub, tenantId: tenantId || `personal:${identity.sub}` };
}

export function request(ctx) {
  const subject = caller(ctx);
  const now = util.time.nowEpochMilliSeconds();
  const window = Math.floor(now / WINDOW_MS);
  const id = [
    "feedback-admission:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
    String(window),
  ].join(".");

  ctx.stash.feedbackAdmissionId = id;
  return {
    operation: "UpdateItem",
    key: util.dynamodb.toMapValues({ id }),
    update: {
      expression:
        "SET tenantId = if_not_exists(tenantId, :tenantId), userId = if_not_exists(userId, :userId), recordType = if_not_exists(recordType, :recordType), expiresAtEpochSeconds = if_not_exists(expiresAtEpochSeconds, :expiresAt), attemptCount = if_not_exists(attemptCount, :zero) + :one",
      expressionValues: util.dynamodb.toMapValues({
        ":tenantId": subject.tenantId,
        ":userId": subject.userId,
        ":recordType": "admission",
        ":expiresAt": Math.floor(now / 1000) + ADMISSION_TTL_SECONDS,
        ":zero": 0,
        ":one": 1,
        ":max": MAX_ATTEMPTS_PER_WINDOW,
      }),
    },
    condition: {
      expression: "attribute_not_exists(attemptCount) OR attemptCount < :max",
      expressionValues: util.dynamodb.toMapValues({ ":max": MAX_ATTEMPTS_PER_WINDOW }),
    },
  };
}

export function response(ctx) {
  if (ctx.error && ctx.error.type === "DynamoDB:ConditionalCheckFailedException") {
    util.error("Feedback rate limit exceeded; retry later", "FeedbackRateLimitError");
  }
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return ctx.prev?.result ?? true;
}
