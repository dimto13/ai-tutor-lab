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
const deletionWorkerUrl = new URL(
  "../../amplify/functions/telemetry-deletion-worker/handler.js",
  import.meta.url,
);
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
  assert.match(writerSource, /telemetryRawEventExpiresAtEpochSeconds/);
  assert.match(writerSource, /expiresAtEpochSeconds/);
  assert.doesNotMatch(writerSource, /ctx\.args\.rawEventRetentionDays/);
  assert.doesNotMatch(writerSource, /nowEpochSeconds/);
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

test("stable account-deletion ownership is isolated from raw telemetry and indexed first", async () => {
  const [schemaSource, writerSource, pointerSource, backendSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(rawWriterUrl, "utf8"),
    readFile(pointerWriterUrl, "utf8"),
    readFile(backendUrl, "utf8"),
  ]);
  const pointerBlock = definitionBlock(schemaSource, "TrainingTelemetryDeletionPointer");
  const appendBlock = definitionBlock(schemaSource, "appendTrainingTelemetryEvent");
  const pointerPosition = appendBlock.indexOf("write-telemetry-deletion-pointer.js");
  const rawPosition = appendBlock.indexOf("append-training-telemetry-event.js");

  assert.doesNotMatch(writerSource, /base64Encode\(subject\.userId\)/);
  assert.doesNotMatch(writerSource, /ownerKey/);
  assert.match(pointerSource, /telemetry-deletion-owner:v1/);
  assert.match(pointerSource, /base64Encode\(subject\.userId\)/);
  assert.match(pointerSource, /function rawEventId/);
  assert.match(pointerSource, /ctx\.stash\.telemetryRawEventId = rawId/);
  assert.match(pointerSource, /ctx\.stash\.telemetryRawEventExpiresAtEpochSeconds/);
  assert.match(writerSource, /ctx\.stash\.telemetryRawEventId/);
  assert.match(writerSource, /ctx\.stash\.telemetryRawEventExpiresAtEpochSeconds/);
  assert.ok(pointerPosition >= 0 && rawPosition >= 0 && pointerPosition < rawPosition);
  assert.doesNotMatch(pointerSource, /attributeValues:[\s\S]*\buserId\s*:/);
  assert.match(pointerBlock, /rawEventId:\s*a\.string\(\)\.required\(\)/);
  assert.match(pointerBlock, /telemetryDeletionByOwnerTime/);
  assert.match(pointerBlock, /expiresAtEpochSeconds:\s*a\.float\(\)\.required\(\)/);
  assert.match(backendSource, /TrainingTelemetryDeletionPointer/);
});

test("account telemetry deletion is one server-controlled, owner-scoped and retry-safe operation", async () => {
  const [schemaSource, workerSource, backendSource, portSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(deletionWorkerUrl, "utf8"),
    readFile(backendUrl, "utf8"),
    readFile(retentionPortUrl, "utf8"),
  ]);
  const deletionBlock = definitionBlock(schemaSource, "deleteMyPersonalTelemetry");

  assert.doesNotMatch(deletionBlock, /\.arguments\(/);
  assert.match(deletionBlock, /allow\.authenticated\(\)/);
  assert.match(deletionBlock, /a\.handler\.function\(telemetryDeletionWorker\)/);
  assert.doesNotMatch(deletionBlock, /delete-my-telemetry-page|delete-my-telemetry-item/);
  assert.match(workerSource, /event\?\.identity/);
  assert.match(workerSource, /cognito:groups/);
  assert.match(workerSource, /tenant:/);
  assert.match(workerSource, /QueryCommand/);
  assert.match(workerSource, /telemetryDeletionByOwnerTime|TELEMETRY_DELETION_POINTER_INDEX_NAME/);
  assert.doesNotMatch(workerSource, /event\.arguments\.(?:userId|tenantId)/);
  assert.match(workerSource, /const targets = await loadDeletionTargets\(subject\)/);
  const rawDeletePosition = workerSource.indexOf("await deleteItems(\n    rawTableName");
  const pointerDeletePosition = workerSource.indexOf("await deleteItems(\n    pointerTableName");
  assert.ok(rawDeletePosition >= 0 && pointerDeletePosition > rawDeletePosition);
  assert.match(workerSource, /return \{ deletedCount: targets\.length, complete: true \}/);
  assert.match(backendSource, /rawTelemetryTable\.grantReadWriteData\(deletionLambda\)/);
  assert.match(backendSource, /deletionPointerTable\.grantReadWriteData\(deletionLambda\)/);
  assert.doesNotMatch(portSource, /while\s*\(true\)|deleteMyRawTelemetryPage/);
  assert.match(portSource, /deleteMyRawTelemetry\(\)/);
});

test("long-lived telemetry projection starts from trim horizon and contains no user dimension", async () => {
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
  assert.match(backendSource, /StreamViewType\.NEW_IMAGE/);
  assert.match(backendSource, /streamSpecification/);
  assert.match(backendSource, /TelemetryAggregateProjectionStream/);
  assert.match(backendSource, /StartingPosition\.TRIM_HORIZON/);
  assert.doesNotMatch(backendSource, /StartingPosition\.LATEST/);
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
