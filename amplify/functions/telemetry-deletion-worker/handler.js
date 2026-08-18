import { BatchWriteItemCommand, DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});
const BATCH_WRITE_LIMIT = 25;
const MAX_UNPROCESSED_RETRIES = 8;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function identityGroups(identity) {
  const direct = identity?.groups;
  if (Array.isArray(direct)) return direct;
  const claim = identity?.claims?.["cognito:groups"];
  if (Array.isArray(claim)) return claim;
  if (typeof claim === "string" && claim.length > 0) return claim.split(",");
  return [];
}

function caller(event) {
  const identity = event?.identity;
  const claimedSub = identity?.claims?.sub;
  const userId =
    typeof identity?.sub === "string" && identity.sub.length > 0
      ? identity.sub
      : typeof claimedSub === "string" && claimedSub.length > 0
        ? claimedSub
        : null;
  if (!userId) throw new Error("Unauthorized telemetry deletion request");

  let tenantId = null;
  for (const group of identityGroups(identity)) {
    if (typeof group !== "string" || !group.startsWith("tenant:")) continue;
    const candidate = group.slice("tenant:".length);
    if (candidate.length === 0) throw new Error("Invalid tenant membership");
    if (tenantId !== null && tenantId !== candidate) {
      throw new Error("Multiple tenant memberships require explicit tenant selection");
    }
    tenantId = candidate;
  }

  return { userId, tenantId: tenantId || `personal:${userId}` };
}

function encoded(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function ownerKey(subject) {
  return ["telemetry-deletion-owner:v1", encoded(subject.tenantId), encoded(subject.userId)].join(
    ".",
  );
}

function requiredStringAttribute(item, name) {
  const value = item?.[name]?.S;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Telemetry deletion pointer ${name} is invalid`);
  }
  return value;
}

async function loadDeletionTargets(subject, send) {
  const tableName = requiredEnvironment("TELEMETRY_DELETION_POINTER_TABLE_NAME");
  const expectedOwnerKey = ownerKey(subject);
  const targets = [];
  let exclusiveStartKey;

  do {
    const result = await send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "ownerKey = :ownerKey",
        ExpressionAttributeValues: { ":ownerKey": { S: expectedOwnerKey } },
        ProjectionExpression: "tenantId, ownerKey, rawEventId",
        ExclusiveStartKey: exclusiveStartKey,
        ConsistentRead: true,
      }),
    );

    for (const item of result.Items || []) {
      const tenantId = requiredStringAttribute(item, "tenantId");
      const persistedOwnerKey = requiredStringAttribute(item, "ownerKey");
      if (tenantId !== subject.tenantId || persistedOwnerKey !== expectedOwnerKey) {
        throw new Error("Telemetry deletion query escaped authenticated owner scope");
      }
      targets.push({ rawEventId: requiredStringAttribute(item, "rawEventId") });
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return { expectedOwnerKey, targets };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function deleteBatch(tableName, keys, send) {
  let pending = keys.map((key) => ({ DeleteRequest: { Key: key } }));
  for (let attempt = 0; pending.length > 0; attempt += 1) {
    const result = await send(
      new BatchWriteItemCommand({
        RequestItems: { [tableName]: pending },
      }),
    );
    pending = result.UnprocessedItems?.[tableName] || [];
    if (pending.length === 0) return;
    if (attempt >= MAX_UNPROCESSED_RETRIES) {
      throw new Error(`Telemetry deletion left ${pending.length} unprocessed items`);
    }
    await sleep(Math.min(25 * 2 ** attempt, 1_000));
  }
}

async function deleteItems(tableName, keys, send) {
  for (const batch of chunks(keys, BATCH_WRITE_LIMIT)) {
    await deleteBatch(tableName, batch, send);
  }
}

export function createTelemetryDeletionHandler(send) {
  return async (event) => {
    const subject = caller(event);
    const { expectedOwnerKey, targets } = await loadDeletionTargets(subject, send);
    if (targets.length === 0) return { deletedCount: 0, complete: true };

    const rawTableName = requiredEnvironment("TELEMETRY_RAW_EVENT_TABLE_NAME");
    const pointerTableName = requiredEnvironment("TELEMETRY_DELETION_POINTER_TABLE_NAME");

    // Preserve every ownership pointer until all raw records have been removed. If the invocation
    // fails before or during this phase, the pointers remain and a retry can deterministically resume.
    await deleteItems(
      rawTableName,
      targets.map((target) => ({ id: { S: target.rawEventId } })),
      send,
    );

    // Pointer deletion is intentionally second. Partial pointer deletion is also retry-safe because
    // raw deletes are idempotent; any remaining pointers continue to identify unfinished cleanup.
    await deleteItems(
      pointerTableName,
      targets.map((target) => ({
        ownerKey: { S: expectedOwnerKey },
        rawEventId: { S: target.rawEventId },
      })),
      send,
    );

    return { deletedCount: targets.length, complete: true };
  };
}

export const handler = createTelemetryDeletionHandler((command) => client.send(command));
