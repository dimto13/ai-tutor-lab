import { util } from "@aws-appsync/utils";

const MAX_TEXT_LENGTH = 4000;
const MAX_CONTEXT_STRING = 256;

// APPSYNC_JS resolvers cannot use regular expressions, so every secret marker below is
// matched by bounded string scanning instead of a RegExp.
const PEM_HEADER = "-----BEGIN";
const PEM_PRIVATE_KEY = "PRIVATE KEY-----";
const BEARER_PREFIX = "Bearer";
const AWS_ACCESS_KEY_PREFIX = "AKIA";
const AWS_ACCESS_KEY_ID_LENGTH = 16;
const MIN_BEARER_TOKEN_LENGTH = 16;
const MIN_ASSIGNED_SECRET_LENGTH = 8;
const MAX_MARKER_SCANS = 64;
const BLANK_CHARS = " \t\r\n";
const UPPER_ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const BEARER_TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~+/=-";
const SECRET_VALUE_STOP_CHARS = " \t\r\n\"'";
const CREDENTIAL_KEYWORDS = [
  "api_key",
  "api-key",
  "apikey",
  "access_token",
  "access-token",
  "accesstoken",
  "client_secret",
  "client-secret",
  "clientsecret",
  "password",
];

const SECRET_PATTERNS = [
  {
    kind: "pem-private-key",
    markers: [PEM_HEADER],
    requiredFollowingLiteral: PEM_PRIVATE_KEY,
  },
  {
    kind: "bearer-token",
    markers: [BEARER_PREFIX],
    valueChars: BEARER_TOKEN_CHARS,
    minValueLength: MIN_BEARER_TOKEN_LENGTH,
  },
  {
    kind: "aws-access-key-id",
    markers: [AWS_ACCESS_KEY_PREFIX],
    caseSensitive: true,
    valueChars: UPPER_ALNUM,
    minValueLength: AWS_ACCESS_KEY_ID_LENGTH,
  },
  {
    kind: "assigned-credential",
    markers: CREDENTIAL_KEYWORDS,
    requiresAssignment: true,
    minValueLength: MIN_ASSIGNED_SECRET_LENGTH,
  },
];

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

// APPSYNC_JS supports neither index-based `for` statements nor `while`, so bounded scans
// iterate an explicitly sliced character array instead.
function runOfAllowed(text, start, allowedChars, max) {
  let length = 0;
  let stopped = false;
  for (const char of text.slice(start, start + max).split("")) {
    if (stopped || allowedChars.indexOf(char) === -1) {
      stopped = true;
    } else {
      length += 1;
    }
  }
  return length;
}

function runUntilStop(text, start, stopChars, max) {
  let length = 0;
  let stopped = false;
  for (const char of text.slice(start, start + max).split("")) {
    if (stopped || stopChars.indexOf(char) !== -1) {
      stopped = true;
    } else {
      length += 1;
    }
  }
  return length;
}

function markerEndOffsets(haystack, marker) {
  const segments = haystack.split(marker);
  const offsets = [];
  let offset = 0;
  for (const segment of segments.slice(0, segments.length - 1)) {
    offset += segment.length + marker.length;
    offsets.push(offset);
  }
  return offsets.slice(0, MAX_MARKER_SCANS);
}

function matchesAfterMarker(text, haystack, pattern, afterMarker) {
  if (pattern.requiredFollowingLiteral) {
    const literal = pattern.caseSensitive
      ? pattern.requiredFollowingLiteral
      : pattern.requiredFollowingLiteral.toLowerCase();
    return haystack.indexOf(literal, afterMarker) !== -1;
  }

  let valueStart = afterMarker + runOfAllowed(text, afterMarker, BLANK_CHARS, text.length);
  if (!pattern.requiresAssignment) {
    return (
      runOfAllowed(text, valueStart, pattern.valueChars, pattern.minValueLength) >=
      pattern.minValueLength
    );
  }

  const separator = text.slice(valueStart, valueStart + 1);
  if (separator !== ":" && separator !== "=") {
    return false;
  }
  valueStart += 1;
  valueStart += runOfAllowed(text, valueStart, BLANK_CHARS, text.length);
  const quote = text.slice(valueStart, valueStart + 1);
  if (quote === '"' || quote === "'") {
    valueStart += 1;
  }
  return (
    runUntilStop(text, valueStart, SECRET_VALUE_STOP_CHARS, pattern.minValueLength) >=
    pattern.minValueLength
  );
}

function matchesPattern(text, loweredText, pattern) {
  const haystack = pattern.caseSensitive ? text : loweredText;
  for (const rawMarker of pattern.markers) {
    const marker = pattern.caseSensitive ? rawMarker : rawMarker.toLowerCase();
    for (const afterMarker of markerEndOffsets(haystack, marker)) {
      if (matchesAfterMarker(text, haystack, pattern, afterMarker)) {
        return true;
      }
    }
  }
  return false;
}

function rejectLikelySecrets(text) {
  const loweredText = text.toLowerCase();
  for (const pattern of SECRET_PATTERNS) {
    if (matchesPattern(text, loweredText, pattern)) {
      util.error(
        "Feedback appears to contain a secret or token and was not stored",
        "FeedbackSensitiveContentError",
      );
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

  const recordId = [
    "feedback:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
    util.base64Encode(clientId),
  ].join(".");
  const now = util.time.nowEpochMilliSeconds();
  const item = {
    id: recordId,
    clientId,
    tenantId: subject.tenantId,
    userId: subject.userId,
    ownerKey: `feedback-owner:v1.${util.base64Encode(subject.tenantId)}.${util.base64Encode(subject.userId)}`,
    source: allowed(input.source, ["tutor", "completion"], "feedback source"),
    kind: allowed(
      input.kind || "general",
      ["problem", "ux", "improvement", "general"],
      "feedback kind",
    ),
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
