import assert from "node:assert/strict";
import test from "node:test";
import { createTelemetryDeletionHandler } from "../../amplify/functions/telemetry-deletion-worker/handler.js";

const RAW_TABLE = "raw-telemetry";
const POINTER_TABLE = "telemetry-deletion-pointers";
const POINTER_INDEX = "telemetryDeletionByOwnerTime";
const TENANT_ID = "tenant-a";
const USER_ID = "user-a";

function encoded(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function ownerKey(): string {
  return ["telemetry-deletion-owner:v1", encoded(TENANT_ID), encoded(USER_ID)].join(".");
}

function pointer(index: number, tenantId = TENANT_ID) {
  return {
    id: { S: `pointer-${index}` },
    tenantId: { S: tenantId },
    ownerKey: { S: ownerKey() },
    rawEventId: { S: `raw-${index}` },
  };
}

function nameOf(command: unknown): string {
  if (!command || typeof command !== "object") throw new Error("Expected DynamoDB command");
  const constructor = Reflect.get(command, "constructor");
  const name = typeof constructor === "function" ? constructor.name : null;
  if (typeof name !== "string") throw new Error("Expected command name");
  return name;
}

function inputOf(command: unknown): Record<string, unknown> {
  if (!command || typeof command !== "object") throw new Error("Expected DynamoDB command");
  const input = Reflect.get(command, "input");
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Expected command input");
  }
  return input as Record<string, unknown>;
}

function batchTable(input: Record<string, unknown>): string {
  const requestItems = input["RequestItems"];
  if (!requestItems || typeof requestItems !== "object" || Array.isArray(requestItems)) {
    throw new Error("Expected batch request items");
  }
  const table = Object.keys(requestItems)[0];
  if (!table) throw new Error("Expected batch table");
  return table;
}

function configureEnvironment(): void {
  process.env["TELEMETRY_RAW_EVENT_TABLE_NAME"] = RAW_TABLE;
  process.env["TELEMETRY_DELETION_POINTER_TABLE_NAME"] = POINTER_TABLE;
  process.env["TELEMETRY_DELETION_POINTER_INDEX_NAME"] = POINTER_INDEX;
}

function identityEvent() {
  return {
    identity: {
      claims: { sub: USER_ID, "cognito:groups": [`tenant:${TENANT_ID}`] },
    },
  };
}

test("server telemetry deletion paginates every owner pointer and removes raw data first", async () => {
  configureEnvironment();
  let queryCount = 0;
  const writeTables: string[] = [];
  const send = async (command: unknown) => {
    const name = nameOf(command);
    const input = inputOf(command);
    if (name === "QueryCommand") {
      queryCount += 1;
      assert.equal(input["TableName"], POINTER_TABLE);
      assert.equal(input["IndexName"], POINTER_INDEX);
      const values = input["ExpressionAttributeValues"] as Record<string, { S?: string }>;
      assert.equal(values[":ownerKey"]?.S, ownerKey());
      return queryCount === 1
        ? { Items: [pointer(1)], LastEvaluatedKey: { id: { S: "pointer-1" } } }
        : { Items: [pointer(2)] };
    }
    if (name === "BatchWriteItemCommand") {
      writeTables.push(batchTable(input));
      return { UnprocessedItems: {} };
    }
    throw new Error(`Unexpected command ${name}`);
  };

  const handler = createTelemetryDeletionHandler(send);
  assert.deepEqual(await handler(identityEvent()), { deletedCount: 2, complete: true });
  assert.equal(queryCount, 2);
  assert.deepEqual(writeTables, [RAW_TABLE, POINTER_TABLE]);
});

test("server telemetry deletion keeps ownership pointers when raw deletion fails", async () => {
  configureEnvironment();
  const writeTables: string[] = [];
  const send = async (command: unknown) => {
    const name = nameOf(command);
    const input = inputOf(command);
    if (name === "QueryCommand") return { Items: [pointer(1)] };
    if (name === "BatchWriteItemCommand") {
      const table = batchTable(input);
      writeTables.push(table);
      if (table === RAW_TABLE) throw new Error("simulated raw failure");
      return { UnprocessedItems: {} };
    }
    throw new Error(`Unexpected command ${name}`);
  };

  const handler = createTelemetryDeletionHandler(send);
  await assert.rejects(() => handler(identityEvent()), /simulated raw failure/);
  assert.deepEqual(writeTables, [RAW_TABLE]);
});

test("server telemetry deletion rejects cross-tenant pointers before any write", async () => {
  configureEnvironment();
  let writes = 0;
  const send = async (command: unknown) => {
    const name = nameOf(command);
    if (name === "QueryCommand") return { Items: [pointer(1, "tenant-b")] };
    if (name === "BatchWriteItemCommand") {
      writes += 1;
      return { UnprocessedItems: {} };
    }
    throw new Error(`Unexpected command ${name}`);
  };

  const handler = createTelemetryDeletionHandler(send);
  await assert.rejects(
    () => handler(identityEvent()),
    /Telemetry deletion query escaped authenticated owner scope/,
  );
  assert.equal(writes, 0);
});
