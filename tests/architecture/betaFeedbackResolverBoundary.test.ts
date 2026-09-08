import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ingestPath = "amplify/data/save-beta-feedback.js";
const admissionPath = "amplify/data/admit-beta-feedback.js";
const inboxPath = "amplify/data/list-beta-feedback.js";
const schemaPath = "amplify/data/beta-feedback-schema.ts";
const backendPath = "amplify/backend.ts";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("feedback ingest derives subject and tenant from authenticated identity", async () => {
  const code = await source(ingestPath);

  assert.match(code, /ctx\.identity/);
  assert.match(code, /identity\.sub/);
  assert.match(code, /tenant:/);
  assert.match(code, /Multiple tenant memberships require explicit tenant selection/);
  assert.doesNotMatch(code, /input\.(tenantId|userId)/);
});

test("feedback ingest is bounded, idempotent and excludes unreviewed runtime payloads", async () => {
  const code = await source(ingestPath);

  assert.match(code, /MAX_TEXT_LENGTH\s*=\s*4000/);
  assert.match(code, /MAX_CONTEXT_STRING\s*=\s*256/);
  assert.match(code, /attribute_not_exists\(id\)/);
  assert.match(code, /ConditionalCheckFailedException/);
  assert.doesNotMatch(code, /runtime:\s*context\.runtime/);
  assert.match(code, /scenarioId/);
  assert.match(code, /stepId/);
  assert.match(code, /runtimeAdapterId/);
  assert.match(code, /appVersion/);
  assert.match(code, /clientTimestamp/);
});

test("feedback ingest rejects likely secrets instead of persisting them", async () => {
  const code = await source(ingestPath);

  assert.match(code, /SECRET_PATTERNS/);
  assert.match(code, /PRIVATE KEY/);
  assert.match(code, /Bearer/);
  assert.match(code, /AKIA/);
  assert.match(code, /FeedbackSensitiveContentError/);
  assert.match(code, /rejectLikelySecrets\(text\)/);
});

test("feedback admission is server-authoritative and bounded per user and tenant", async () => {
  const code = await source(admissionPath);

  assert.match(code, /ctx\.identity/);
  assert.match(code, /identity\.sub/);
  assert.match(code, /Multiple tenant memberships require explicit tenant selection/);
  assert.match(code, /WINDOW_MS\s*=\s*60_000/);
  assert.match(code, /MAX_ATTEMPTS_PER_WINDOW\s*=\s*6/);
  assert.match(code, /attemptCount < :max/);
  assert.match(code, /FeedbackRateLimitError/);
  assert.match(code, /expiresAtEpochSeconds/);
  assert.doesNotMatch(code, /ctx\.args\.(tenantId|userId)/);
});

test("feedback inbox is admin-only and tenant scoped fail-closed", async () => {
  const code = await source(inboxPath);

  assert.match(code, /role:tenant_admin/);
  assert.match(code, /role:owner/);
  assert.match(code, /util\.unauthorized\(\)/);
  assert.match(code, /betaFeedbackByTenantTime/);
  assert.match(code, /tenantId = :tenantId/);
  assert.match(code, /item\.tenantId === tenantId/);
  assert.match(code, /limit < 1 \|\| limit > 250/);
});

test("feedback retention reuses the server-side tenant privacy policy and DynamoDB TTL", async () => {
  const ingest = await source(ingestPath);
  const schema = await source(schemaPath);
  const backend = await source(backendPath);

  assert.match(schema, /dataSource: a\.ref\("TenantTelemetryPolicy"\)[\s\S]*telemetry-load-policy-for-write\.js/);
  assert.match(schema, /expiresAtEpochSeconds: a\.float\(\)\.required\(\)/);
  assert.match(ingest, /ctx\.stash\.telemetryRawEventRetentionDays/);
  assert.match(ingest, /FeedbackRetentionPolicyError/);
  assert.match(ingest, /expiresAtEpochSeconds:/);
  assert.match(backend, /amplifyDynamoDbTables\["BetaFeedback"\]/);
  assert.match(backend, /amplifyDynamoDbTables\["BetaFeedbackAdmission"\]/);
  assert.match(backend, /attributeName: "expiresAtEpochSeconds"/);
});
