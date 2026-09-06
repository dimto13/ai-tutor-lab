import { util } from "@aws-appsync/utils";

const MAX_TEXT_LENGTH = 4000;
const MAX_CONTEXT_STRING = 256;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[^\s"']{8,}/i,
];

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }
  const groups = identity.groups || [];
  let tenantId = null;
  for (const group of groups) {
    if (typeof group !== "string" || !group.startsWith("tenant:")) continue;
    const candidate = group.slice("tenant:".length);
    if (!candidate) util.error("Invalid tenant membership", "TenantMembershipError");
    if (tenantId !== null && tenantId !== candidate) {
      util.error("Multiple tenant memberships require explicit tenant selection", "TenantMembershipError");
    }
    tenantId = candidate;
  }
  return { userId: identity.sub, tenantId: tenantId || `personal:${identity.sub}` };
}

function boundedString(value, name, required = true) {
  if (value === null || value === undefined) {
    if (required) util.error(`${name} is required`, "FeedbackValidationError");
    return null;
  }
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CONTEXT_STRING) {
    util.error(`${name} must be a bounded non-empty string`, "FeedbackValidationError");
  }
  return value;
}

function allowed(value, values, name) {
  if (!values.includes(value)) util.error(`Unsupported ${name}`, "FeedbackValidationError");
  return value;
}

function rejectLikelySecrets(text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      util.error("Feedback appears to contain a secret or token and was not stored", "FeedbackSensitiveContentError");
    }
  }
}

export function request(ctx) {
  const subject = caller(ctx);
  const input = ctx.args.input;
  if (!input || typeof input !== "object" || typeof input.length === "number") {
    util.error("Feedback input must be an object", "FeedbackValidationError");
  }
  const clientId = boundedString(input.id, "id");
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    util.error("Feedback text must contain 1..4000 characters", "FeedbackValidationError");
  }
  rejectLikelySecrets(text);
  const context = input.context;
  if (!context || typeof context !== "object" || typeof context.length === "number") {
    util.error("Feedback context is required", "FeedbackValidationError");
  }

  const recordId = ["feedback:v1", util.base64Encode(subject.tenantId), util.base64Encode(subject.userId), util.base64Encode(clientId)].join(".");
  const now = util.time.nowEpochMilliSeconds();
  const item = {
    id: recordId,
    clientId,
    tenantId: subject.tenantId,
    userId: subject.userId,
    ownerKey: `feedback-owner:v1.${util.base64Encode(subject.tenantId)}.${util.base64Encode(subject.userId)}`,
    source: allowed(input.source, ["tutor", "completion"], "feedback source"),
    kind: allowed(input.kind || "general", ["problem", "ux", "improvement", "general"], "feedback kind"),
    text,
    scenarioId: boundedString(context.scenarioId, "scenarioId"),
    stepId: boundedString(context.stepId, "stepId", false),
    mode: boundedString(context.mode, "mode"),
    runtimeAdapterId: boundedString(context.runtimeAdapterId, "runtimeAdapterId", false),
    appVersion: boundedString(context.appVersion, "appVersion"),
    commit: boundedString(context.commit, "commit"),
    clientTimestamp: boundedString(context.timestamp, "timestamp"),
    receivedAt: now,
  };

  // Persist only the explicitly allowlisted structured context above. In particular,
  // screenshots/data URLs and arbitrary runtime payloads are intentionally excluded.
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id: recordId }),
    attributeValues: util.dynamodb.toMapValues(item),
    condition: { expression: "attribute_not_exists(id)" },
  };
}

export function response(ctx) {
  if (ctx.error && ctx.error.type === "DynamoDB:ConditionalCheckFailedException") {
    return { accepted: true, duplicate: true };
  }
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return { accepted: true, duplicate: false };
}
