import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataResourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const writeResolverUrl = new URL(
  "../../amplify/data/append-training-telemetry-event.js",
  import.meta.url,
);
const lifecycleResolverUrl = new URL(
  "../../amplify/data/write-telemetry-deletion-pointer.js",
  import.meta.url,
);
const policyResolverUrl = new URL(
  "../../amplify/data/telemetry-load-policy-for-write.js",
  import.meta.url,
);
const queryResolverUrl = new URL("../../amplify/data/load-training-analytics.js", import.meta.url);
const pipelineUrl = new URL("../../apps/web/src/telemetry/telemetryPipeline.ts", import.meta.url);

test("telemetry ingestion accepts canonical events but no client owner fields", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  const start = source.indexOf("  appendTrainingTelemetryEvent:");
  const end = source.indexOf("\n  loadTenantTelemetryPolicy:", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /event:\s*a\.json\(\)\.required\(\)/);
  assert.doesNotMatch(block, /\buserId\s*:/);
  assert.doesNotMatch(block, /\btenantId\s*:/);
  assert.match(block, /allow\.authenticated\(\)/);
  assert.match(block, /TenantTelemetryPolicy/);
  assert.match(block, /TrainingTelemetryEvent/);
});

test("telemetry resolvers derive tenant from Cognito without a stable user pseudonym", async () => {
  const [schemaSource, policySource, lifecycleSource, writeSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(policyResolverUrl, "utf8"),
    readFile(lifecycleResolverUrl, "utf8"),
    readFile(writeResolverUrl, "utf8"),
  ]);

  assert.match(
    schemaSource,
    /TelemetryPseudonymizationMode: a\.enum\(\["SESSION", "ANONYMOUS"\]\)/,
  );
  assert.match(policySource, /identity\.sub/);
  assert.match(policySource, /tenant:/);
  assert.doesNotMatch(policySource, /ctx\.args\.userId/);
  assert.doesNotMatch(policySource, /ctx\.args\.tenantId/);

  assert.match(lifecycleSource, /parseISO8601ToEpochMilliSeconds/);
  assert.match(lifecycleSource, /telemetryRawEventOccurredAt/);
  assert.match(lifecycleSource, /telemetryRawEventExpiresAtEpochSeconds/);
  assert.doesNotMatch(lifecycleSource, /ctx\.args\.userId/);
  assert.doesNotMatch(lifecycleSource, /ctx\.args\.tenantId/);

  assert.match(writeSource, /telemetrySubject/);
  assert.match(writeSource, /subjectKey/);
  assert.match(writeSource, /"anonymous:v1"/);
  assert.match(writeSource, /session:v1:/);
  assert.match(writeSource, /telemetryRawEventOccurredAt/);
  assert.match(writeSource, /telemetryRawEventExpiresAtEpochSeconds/);
  assert.doesNotMatch(writeSource, /base64Encode\(subject\.userId\)/);
  assert.doesNotMatch(writeSource, /attributeValues:[\s\S]*userId\s*:/);
  assert.doesNotMatch(writeSource, /ctx\.args\.userId/);
  assert.doesNotMatch(writeSource, /ctx\.args\.tenantId/);
});

test("analytics query is tenant scoped, aggregate only, exact and cohort protected", async () => {
  const [schemaSource, resolverSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(queryResolverUrl, "utf8"),
  ]);
  const eventModelStart = schemaSource.indexOf("  TrainingTelemetryEvent:");
  const eventModelEnd = schemaSource.indexOf("\n  TrainingStateEnvelope:", eventModelStart);
  const eventModelBlock = schemaSource.slice(eventModelStart, eventModelEnd);
  const queryStart = schemaSource.indexOf("  loadTrainingAnalytics:");
  const queryEnd = schemaSource.indexOf("\n  awardScenarioScore:", queryStart);
  const queryBlock = schemaSource.slice(queryStart, queryEnd);

  assert.match(eventModelBlock, /occurredAt:\s*a\.float\(\)\.required\(\)/);
  assert.match(queryBlock, /from:\s*a\.float\(\)/);
  assert.match(queryBlock, /to:\s*a\.float\(\)/);
  assert.match(queryBlock, /role:trainer/);
  assert.match(queryBlock, /role:tenant_admin/);
  assert.doesNotMatch(queryBlock, /\buserId\s*:/);
  assert.doesNotMatch(queryBlock, /\bsessionId\s*:/);
  assert.match(resolverSource, /MIN_REPORTING_COHORT\s*=\s*3/);
  assert.match(resolverSource, /cohortSuppressed/);
  assert.match(resolverSource, /tenantScenarioKey/);
  assert.match(resolverSource, /analyticsReferenceEpochSeconds/);
  assert.match(resolverSource, /epochMilliSecondsToSeconds/);
  assert.match(resolverSource, /TrainingAnalyticsRangeTooLarge/);
  assert.match(resolverSource, /ctx\.result\.nextToken/);
  assert.doesNotMatch(resolverSource, /subjectKey\s*:/);
});

test("telemetry reuses the canonical in-process EventBus instead of defining another one", async () => {
  const source = await readFile(pipelineUrl, "utf8");
  assert.match(source, /new InProcessTrainingEventBus\(\[sink\]\)/);
  assert.doesNotMatch(source, /class\s+\w*EventBus\b/);
  assert.doesNotMatch(source, /interface\s+\w*EventBus\b/);
});
