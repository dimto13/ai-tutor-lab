import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ingestPath = "amplify/data/save-beta-feedback.js";
const inboxPath = "amplify/data/list-beta-feedback.js";

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
  assert.doesNotMatch(code, /screenshot/i);
  assert.match(code, /scenarioId/);
  assert.match(code, /stepId/);
  assert.match(code, /runtimeAdapterId/);
  assert.match(code, /appVersion/);
  assert.match(code, /clientTimestamp/);
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
