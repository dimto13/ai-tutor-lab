import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataResourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const backendUrl = new URL("../../amplify/backend.ts", import.meta.url);
const policyResolverUrl = new URL(
  "../../amplify/data/telemetry-load-policy-for-write.js",
  import.meta.url,
);
const rawWriterUrl = new URL(
  "../../amplify/data/append-training-telemetry-event.js",
  import.meta.url,
);
const pointerWriterUrl = new URL(
  "../../amplify/data/write-telemetry-deletion-pointer.js",
  import.meta.url,
);
const deletionQueryUrl = new URL("../../amplify/data/delete-my-telemetry-page.js", import.meta.url);
const retentionPortUrl = new URL(
  "../../apps/web/src/telemetry/telemetryRetention.ts",
  import.meta.url,
);
const retentionAdapterUrl = new URL(
  "../../apps/web/src/telemetry/adapters/amplifyTelemetryRetentionAdapter.ts",
  import.meta.url,
);
const aggregateProjectorUrl = new URL(
  "../../amplify/functions/telemetry-aggregate-projector/handler.js",
  import.meta.url,
);

function definitionBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} must exist in Amplify Data schema`);
  const remainder = source.slice(start + name.length + 3);
  const nextDefinition = remainder.search(/\n {2}[A-Za-z][A-Za-z0-9]*:/);
  const end =
    nextDefinition >= 0 ? start + name.length + 3 + nextDefinition : source.indexOf("\n});", start);
  return source.slice(start, end >= 0 ? end : source.length);
}

test("raw telemetry retention defaults to 90 days and is stamped server-side", async () => {
  const [schemaSource, policySource, writerSource, backendSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(policyResolverUrl, "utf8"),
    readFile(rawWriterUrl, "utf8"),
    readFile(backendUrl, "utf8"),
  ]);
  const policyBlock = definitionBlock(schemaSource, "TenantTelemetryPolicy");
  const rawBlock = definitionBlock(schemaSource, "TrainingTelemetryEvent");

  assert.match(policyBlock, /rawEventRetentionDays:\s*a\.integer\(\)/);
  assert.match(policySource, /DEFAULT_RAW_EVENT_RETENTION_DAYS\s*=\s*90/);
  assert.match(writerSource, /telemetryRawEventRetentionDays/);
  assert.match(writerSource, /expiresAtEpochSeconds/);
  assert.doesNotMatch(writerSource, /ctx\.args\.rawEventRetentionDays/);
  assert.match(rawBlock, /expiresAtEpochSeconds:\s*a\.float\(\)\.required\(\)/);
  assert.doesNotMatch(rawBlock, /ownerKey|userId/);
  assert.match(backendSource, /TrainingTelemetryEvent/);
  assert.match(backendSource, /timeToLiveAttribute/);
  assert.match(backendSource, /attributeName:\s*"expiresAtEpochSeconds"/);
});

test("tenant retention extends the existing telemetry policy instead of creating a second policy", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  const loadBlock = definitionBlock(source, "loadTenantTelemetryPolicy");
  const saveBlock = definitionBlock(source, "saveTenantTelemetryPolicy");

  assert.match(loadBlock, /TenantTelemetryPolicy/);
  assert.match(loadBlock, /telemetry-load-policy-for-write\.js/);
  assert.match(saveBlock, /pseudonymizationMode:\s*a\.ref\("TelemetryPseudonymizationMode"\)/);
  assert.match(saveBlock, /rawEventRetentionDays:\s*a\.integer\(\)/);
  assert.match(saveBlock, /telemetry-load-policy-for-write\.js/);
  assert.match(saveBlock, /save-tenant-telemetry-policy\.js/);
  assert.equal((source.match(/^ {2}TenantTelemetryPolicy:\s*a/gm) || []).length, 1);
});

test("stable account-deletion ownership is isolated from raw telemetry and expires with it", async () => {
  const [schemaSource, writerSource, pointerSource, backendSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(rawWriterUrl, "utf8"),
    readFile(pointerWriterUrl, "utf8"),
    readFile(backendUrl, "utf8"),
  ]);
  const pointerBlock = definitionBlock(schemaSource, "TrainingTelemetryDeletionPointer");

  assert.doesNotMatch(writerSource, /base64Encode\(subject\.userId\)/);
  assert.doesNotMatch(writerSource, /ownerKey/);
  assert.match(pointerSource, /telemetry-deletion-owner:v1/);
  assert.match(pointerSource, /base64Encode\(subject\.userId\)/);
  assert.match(pointerSource, /telemetryRawEventId/);
  assert.doesNotMatch(pointerSource, /attributeValues:[\s\S]*\buserId\s*:/);
  assert.match(pointerBlock, /rawEventId:\s*a\.string\(\)\.required\(\)/);
  assert.match(pointerBlock, /telemetryDeletionByOwnerTime/);
  assert.match(pointerBlock, /expiresAtEpochSeconds:\s*a\.float\(\)\.required\(\)/);
  assert.match(backendSource, /TrainingTelemetryDeletionPointer/);
});

test("account telemetry deletion derives owner scope from identity and accepts no client scope", async () => {
  const [schemaSource, querySource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(deletionQueryUrl, "utf8"),
  ]);
  const deletionBlock = definitionBlock(schemaSource, "deleteMyPersonalTelemetry");

  assert.doesNotMatch(deletionBlock, /\.arguments\(/);
  assert.match(deletionBlock, /allow\.authenticated\(\)/);
  assert.match(deletionBlock, /TrainingTelemetryDeletionPointer/);
  assert.match(deletionBlock, /TrainingTelemetryEvent/);
  assert.match(querySource, /identity\.sub/);
  assert.match(querySource, /tenant:/);
  assert.match(querySource, /telemetryDeletionByOwnerTime/);
  assert.doesNotMatch(querySource, /ctx\.args\.userId/);
  assert.doesNotMatch(querySource, /ctx\.args\.tenantId/);
});

test("long-lived telemetry projection contains aggregate metrics but no user or session dimension", async () => {
  const [schemaSource, projectorSource, backendSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(aggregateProjectorUrl, "utf8"),
    readFile(backendUrl, "utf8"),
  ]);
  const aggregateBlock = definitionBlock(schemaSource, "TrainingTelemetryAggregate");

  assert.match(aggregateBlock, /sessionsStarted/);
  assert.match(aggregateBlock, /sessionsCompleted/);
  assert.match(aggregateBlock, /hintUsageCount/);
  assert.match(aggregateBlock, /failedAttemptCount/);
  assert.match(aggregateBlock, /stepDurationTotalMs/);
  assert.doesNotMatch(aggregateBlock, /userId|sessionId|subjectKey|eventId|payload/);
  assert.match(projectorSource, /TransactWriteItemsCommand/);
  assert.match(projectorSource, /GetItemCommand/);
  assert.match(projectorSource, /projectionReceiptExists/);
  assert.match(projectorSource, /attribute_not_exists\(id\)/);
  assert.match(projectorSource, /telemetry-projection-receipt:v1/);
  assert.doesNotMatch(projectorSource, /ownerKey|userId|sessionId|subjectKey/);
  assert.match(backendSource, /TelemetryAggregateProjectionStream/);
  assert.match(backendSource, /reportBatchItemFailures:\s*true/);
});

test("retention stays cloud-neutral above the Amplify adapter", async () => {
  const [portSource, adapterSource] = await Promise.all([
    readFile(retentionPortUrl, "utf8"),
    readFile(retentionAdapterUrl, "utf8"),
  ]);

  assert.match(portSource, /interface TelemetryRetentionPort/);
  assert.match(portSource, /class TelemetryRetentionService/);
  assert.match(portSource, /deleteForAccountClosure/);
  assert.doesNotMatch(portSource, /aws-amplify|amplify\/data|Schema/);
  assert.match(adapterSource, /generateClient/);
  assert.match(adapterSource, /deleteMyPersonalTelemetry/);
});
