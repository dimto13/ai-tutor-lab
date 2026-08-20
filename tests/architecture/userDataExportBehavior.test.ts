import assert from "node:assert/strict";
import test from "node:test";
import { createUserDataExportHandler } from "../../amplify/functions/user-data-export/handler.js";

const TENANT_ID = "tenant-a";
const USER_ID = "user-a";

const TABLES = {
  profile: "profile-table",
  preferences: "preferences-table",
  trainingSessions: "training-session-table",
  stepStates: "step-state-table",
  runtimeSnapshots: "runtime-snapshot-table",
  hintUsage: "hint-usage-table",
  attempts: "attempt-table",
  scenarioRuns: "scenario-run-table",
  scoreEvents: "score-event-table",
  skillProfiles: "skill-profile-table",
  attestations: "attestation-table",
  scorePolicy: "score-policy-table",
  telemetryPolicy: "telemetry-policy-table",
  rawTelemetry: "raw-telemetry-table",
  telemetryPointers: "telemetry-pointer-table",
} as const;

function configureEnvironment(): void {
  process.env["USER_PROFILE_TABLE_NAME"] = TABLES.profile;
  process.env["USER_PREFERENCES_TABLE_NAME"] = TABLES.preferences;
  process.env["TRAINING_SESSION_TABLE_NAME"] = TABLES.trainingSessions;
  process.env["STEP_STATE_TABLE_NAME"] = TABLES.stepStates;
  process.env["RUNTIME_SNAPSHOT_TABLE_NAME"] = TABLES.runtimeSnapshots;
  process.env["HINT_USAGE_TABLE_NAME"] = TABLES.hintUsage;
  process.env["ATTEMPT_TABLE_NAME"] = TABLES.attempts;
  process.env["SCENARIO_RUN_TABLE_NAME"] = TABLES.scenarioRuns;
  process.env["SCORE_EVENT_TABLE_NAME"] = TABLES.scoreEvents;
  process.env["SKILL_PROFILE_TABLE_NAME"] = TABLES.skillProfiles;
  process.env["ATTESTATION_TABLE_NAME"] = TABLES.attestations;
  process.env["TENANT_SCORE_VISIBILITY_POLICY_TABLE_NAME"] = TABLES.scorePolicy;
  process.env["TENANT_TELEMETRY_POLICY_TABLE_NAME"] = TABLES.telemetryPolicy;
  process.env["TELEMETRY_RAW_EVENT_TABLE_NAME"] = TABLES.rawTelemetry;
  process.env["TELEMETRY_DELETION_POINTER_TABLE_NAME"] = TABLES.telemetryPointers;
}

function identityEvent(fieldName = "exportMyData", argumentsValue: Record<string, unknown> = {}) {
  return {
    identity: {
      claims: { sub: USER_ID, "cognito:groups": [`tenant:${TENANT_ID}`] },
    },
    arguments: argumentsValue,
    info: { fieldName },
  };
}

function stringItem(values: Record<string, string | number | boolean>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (typeof value === "string") return [key, { S: value }];
      if (typeof value === "number") return [key, { N: String(value) }];
      return [key, { BOOL: value }];
    }),
  );
}

function descriptorType(command: unknown): string {
  if (!command || typeof command !== "object") throw new Error("Expected DynamoDB descriptor");
  const value = Reflect.get(command, "type");
  if (typeof value !== "string") throw new Error("Expected descriptor type");
  return value;
}

function descriptorInput(command: unknown): Record<string, unknown> {
  if (!command || typeof command !== "object") throw new Error("Expected DynamoDB descriptor");
  const value = Reflect.get(command, "input");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected descriptor input");
  }
  return value as Record<string, unknown>;
}

function defaultSend(command: unknown) {
  const type = descriptorType(command);
  const input = descriptorInput(command);
  const tableName = input["TableName"];
  if (type === "get") return Promise.resolve({});
  if (type === "query") {
    assert.equal(tableName, TABLES.telemetryPointers);
    return Promise.resolve({ Items: [] });
  }
  if (type === "scan") {
    const values = input["ExpressionAttributeValues"] as Record<string, { S?: string }>;
    assert.equal(values[":tenantId"]?.S, TENANT_ID);
    assert.equal(values[":userId"]?.S, USER_ID);
    if (tableName === TABLES.profile) {
      return Promise.resolve({
        Items: [
          stringItem({
            id: "profile-id",
            tenantId: TENANT_ID,
            userId: USER_ID,
            displayName: "Test User",
            profileVersion: 2,
          }),
        ],
      });
    }
    return Promise.resolve({ Items: [] });
  }
  if (type === "batchGet") return Promise.resolve({ Responses: {}, UnprocessedKeys: {} });
  throw new Error(`Unexpected descriptor ${type}`);
}

test("own-data export derives subject from auth and returns only the authenticated subject", async () => {
  configureEnvironment();
  const handler = createUserDataExportHandler(defaultSend, () => Date.UTC(2026, 7, 20, 4, 0, 0));
  const serialized = await handler(identityEvent());
  const exported = JSON.parse(serialized) as {
    generatedAt: string;
    subject: { tenantId: string; userId: string };
    visibilityAndRetention: {
      scoreVisibility: string;
      rawTelemetryRetentionDays: number;
    };
    cloud: { profile: Array<Record<string, unknown>>; rawTelemetry: unknown[] };
  };

  assert.equal(exported.generatedAt, "2026-08-20T04:00:00.000Z");
  assert.deepEqual(exported.subject, { tenantId: TENANT_ID, userId: USER_ID });
  assert.equal(exported.visibilityAndRetention.scoreVisibility, "private");
  assert.equal(exported.visibilityAndRetention.rawTelemetryRetentionDays, 90);
  assert.equal(exported.cloud.profile.length, 1);
  assert.equal(exported.cloud.profile[0]?.["userId"], USER_ID);
  assert.deepEqual(exported.cloud.rawTelemetry, []);
});

test("transparency context defaults to private and the actual 90-day telemetry default", async () => {
  configureEnvironment();
  const handler = createUserDataExportHandler(defaultSend);
  assert.deepEqual(await handler(identityEvent("loadMyDataTransparencyContext")), {
    scoreVisibility: "private",
    leaderboardsEnabled: false,
    namedApprovalConfirmed: false,
    telemetryPseudonymizationMode: "SESSION",
    rawTelemetryRetentionDays: 90,
  });
});

test("own-data export rejects missing authentication", async () => {
  configureEnvironment();
  const handler = createUserDataExportHandler(defaultSend);
  await assert.rejects(
    () => handler({ arguments: {}, info: { fieldName: "exportMyData" } }),
    /Unauthorized user data export request/,
  );
});

test("own-data export rejects client-authoritative subject arguments", async () => {
  configureEnvironment();
  const handler = createUserDataExportHandler(defaultSend);
  await assert.rejects(
    () => handler(identityEvent("exportMyData", { userId: "other-user", tenantId: "tenant-b" })),
    /does not accept client-authoritative subject arguments/,
  );
});

test("own-data export fails closed if a personal table returns another user", async () => {
  configureEnvironment();
  const handler = createUserDataExportHandler(async (command: unknown) => {
    const type = descriptorType(command);
    const input = descriptorInput(command);
    if (type === "get") return {};
    if (type === "query") return { Items: [] };
    if (type === "scan" && input["TableName"] === TABLES.profile) {
      return {
        Items: [
          stringItem({
            tenantId: TENANT_ID,
            userId: "other-user",
            displayName: "Wrong User",
            profileVersion: 1,
          }),
        ],
      };
    }
    if (type === "scan") return { Items: [] };
    throw new Error(`Unexpected descriptor ${type}`);
  });

  await assert.rejects(
    () => handler(identityEvent()),
    /User data export scan escaped authenticated subject scope/,
  );
});

test("own-data export fails closed if tenant policy escapes authenticated tenant", async () => {
  configureEnvironment();
  const handler = createUserDataExportHandler(async (command: unknown) => {
    const type = descriptorType(command);
    const input = descriptorInput(command);
    if (type === "get" && input["TableName"] === TABLES.scorePolicy) {
      return {
        Item: stringItem({
          id: "score-policy",
          tenantId: "tenant-b",
          visibility: "aggregate",
          leaderboardsEnabled: false,
          updatedAt: 1,
        }),
      };
    }
    if (type === "get") return {};
    if (type === "scan") return { Items: [] };
    if (type === "query") return { Items: [] };
    throw new Error(`Unexpected descriptor ${type}`);
  });

  await assert.rejects(
    () => handler(identityEvent()),
    /Score visibility policy escaped authenticated tenant scope/,
  );
});

test("own-data export rejects conflicting tenant memberships before reading data", async () => {
  configureEnvironment();
  let reads = 0;
  const handler = createUserDataExportHandler(async () => {
    reads += 1;
    return {};
  });
  await assert.rejects(
    () =>
      handler({
        identity: {
          claims: { sub: USER_ID, "cognito:groups": [`tenant:${TENANT_ID}`, "tenant:tenant-b"] },
        },
        arguments: {},
        info: { fieldName: "exportMyData" },
      }),
    /Multiple tenant memberships require explicit tenant selection/,
  );
  assert.equal(reads, 0);
});
