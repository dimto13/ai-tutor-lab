const DEFAULT_RAW_EVENT_RETENTION_DAYS = 90;
const BATCH_GET_LIMIT = 100;
const MAX_UNPROCESSED_RETRIES = 8;

const PERSONAL_TABLES = [
  ["profile", "USER_PROFILE_TABLE_NAME"],
  ["preferences", "USER_PREFERENCES_TABLE_NAME"],
  ["trainingSessions", "TRAINING_SESSION_TABLE_NAME"],
  ["runtimeSnapshots", "RUNTIME_SNAPSHOT_TABLE_NAME"],
  ["scenarioRuns", "SCENARIO_RUN_TABLE_NAME"],
  ["scoreEvents", "SCORE_EVENT_TABLE_NAME"],
  ["attestations", "ATTESTATION_TABLE_NAME"],
];

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
  if (!userId) throw new Error("Unauthorized user data export request");

  if (
    event?.arguments &&
    typeof event.arguments === "object" &&
    Object.keys(event.arguments).length > 0
  ) {
    throw new Error("User data export does not accept client-authoritative subject arguments");
  }

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
  if (tenantId === null) throw new Error("Tenant membership is required for user data export");

  return { userId, tenantId };
}

function encoded(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function scorePolicyId(tenantId) {
  return `score-visibility-policy:v1:${encoded(tenantId)}`;
}

function telemetryPolicyId(tenantId) {
  return `telemetry-policy:v1:${encoded(tenantId)}`;
}

function telemetryOwnerKey(subject) {
  return [
    "telemetry-deletion-owner:v1",
    encoded(subject.tenantId),
    encoded(subject.userId),
  ].join(".");
}

function decodeAttribute(attribute) {
  if (!attribute || typeof attribute !== "object") return null;
  if (typeof attribute.S === "string") return attribute.S;
  if (typeof attribute.N === "string") return Number(attribute.N);
  if (typeof attribute.BOOL === "boolean") return attribute.BOOL;
  if (attribute.NULL === true) return null;
  if (Array.isArray(attribute.SS)) return [...attribute.SS];
  if (Array.isArray(attribute.NS)) return attribute.NS.map((value) => Number(value));
  if (Array.isArray(attribute.L)) return attribute.L.map(decodeAttribute);
  if (attribute.M && typeof attribute.M === "object") return decodeItem(attribute.M);
  if (attribute.B) return Buffer.from(attribute.B).toString("base64");
  throw new Error("Unsupported DynamoDB attribute in user data export");
}

function decodeItem(item) {
  const result = {};
  for (const [key, attribute] of Object.entries(item || {})) {
    result[key] = decodeAttribute(attribute);
  }
  return result;
}

function cleanRow(row) {
  const result = { ...row };
  delete result.ownerKey;
  delete result.appendToken;
  return result;
}

function getDescriptor(input) {
  return { type: "get", input };
}

function scanDescriptor(input) {
  return { type: "scan", input };
}

function queryDescriptor(input) {
  return { type: "query", input };
}

function batchGetDescriptor(input) {
  return { type: "batchGet", input };
}

async function loadPolicy(tableName, id, send) {
  const result = await send(
    getDescriptor({
      TableName: tableName,
      Key: { id: { S: id } },
      ConsistentRead: true,
    }),
  );
  return result.Item ? decodeItem(result.Item) : null;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function scoreVisibilityContext(row, tenantId) {
  if (!row) {
    return {
      scoreVisibility: "private",
      leaderboardsEnabled: false,
      namedApprovalConfirmed: false,
    };
  }
  if (row.tenantId !== tenantId) {
    throw new Error("Score visibility policy escaped authenticated tenant scope");
  }
  if (row.visibility !== "private" && row.visibility !== "aggregate" && row.visibility !== "named") {
    throw new Error("Persisted score visibility level is invalid");
  }
  if (typeof row.leaderboardsEnabled !== "boolean") {
    throw new Error("Persisted leaderboard policy is invalid");
  }

  const hasApproval =
    hasText(row.namedApprovalReference) &&
    hasText(row.namedApprovalConfirmedBy) &&
    typeof row.namedApprovalConfirmedAt === "number" &&
    Number.isFinite(row.namedApprovalConfirmedAt) &&
    row.namedApprovalConfirmedAt > 0;
  if (row.visibility === "named" && !hasApproval) {
    throw new Error("Named score visibility is missing documented approval");
  }
  if (row.visibility !== "named" && (row.leaderboardsEnabled || hasApproval)) {
    throw new Error("Persisted score visibility policy is contradictory");
  }

  return {
    scoreVisibility: row.visibility,
    leaderboardsEnabled: row.leaderboardsEnabled,
    namedApprovalConfirmed: row.visibility === "named" && hasApproval,
  };
}

function telemetryContext(row, tenantId) {
  if (row && row.tenantId !== tenantId) {
    throw new Error("Telemetry policy escaped authenticated tenant scope");
  }
  const rawDays = row?.rawEventRetentionDays;
  const rawTelemetryRetentionDays =
    typeof rawDays === "number" && Number.isInteger(rawDays) && rawDays >= 1
      ? rawDays
      : DEFAULT_RAW_EVENT_RETENTION_DAYS;
  return {
    telemetryPseudonymizationMode: row?.pseudonymizationMode === "ANONYMOUS" ? "ANONYMOUS" : "SESSION",
    rawTelemetryRetentionDays,
  };
}

async function loadTransparencyContext(subject, send) {
  const [scorePolicy, telemetryPolicy] = await Promise.all([
    loadPolicy(
      requiredEnvironment("TENANT_SCORE_VISIBILITY_POLICY_TABLE_NAME"),
      scorePolicyId(subject.tenantId),
      send,
    ),
    loadPolicy(
      requiredEnvironment("TENANT_TELEMETRY_POLICY_TABLE_NAME"),
      telemetryPolicyId(subject.tenantId),
      send,
    ),
  ]);
  return {
    ...scoreVisibilityContext(scorePolicy, subject.tenantId),
    ...telemetryContext(telemetryPolicy, subject.tenantId),
  };
}

async function scanPersonalTable(tableName, subject, send) {
  const rows = [];
  let exclusiveStartKey;
  do {
    const result = await send(
      scanDescriptor({
        TableName: tableName,
        ConsistentRead: true,
        FilterExpression: "#tenantId = :tenantId AND #userId = :userId",
        ExpressionAttributeNames: {
          "#tenantId": "tenantId",
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":tenantId": { S: subject.tenantId },
          ":userId": { S: subject.userId },
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items || []) {
      const row = decodeItem(item);
      if (row.tenantId !== subject.tenantId || row.userId !== subject.userId) {
        throw new Error("User data export scan escaped authenticated subject scope");
      }
      rows.push(cleanRow(row));
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return rows;
}

async function loadTelemetryPointers(subject, send) {
  const tableName = requiredEnvironment("TELEMETRY_DELETION_POINTER_TABLE_NAME");
  const expectedOwnerKey = telemetryOwnerKey(subject);
  const rawEventIds = [];
  let exclusiveStartKey;
  do {
    const result = await send(
      queryDescriptor({
        TableName: tableName,
        KeyConditionExpression: "ownerKey = :ownerKey",
        ExpressionAttributeValues: { ":ownerKey": { S: expectedOwnerKey } },
        ProjectionExpression: "tenantId, ownerKey, rawEventId",
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items || []) {
      const row = decodeItem(item);
      if (row.tenantId !== subject.tenantId || row.ownerKey !== expectedOwnerKey) {
        throw new Error("Telemetry export query escaped authenticated subject scope");
      }
      if (!hasText(row.rawEventId)) throw new Error("Telemetry export pointer is invalid");
      rawEventIds.push(row.rawEventId);
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return rawEventIds;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function batchGetRawTelemetry(tableName, ids, send) {
  const rows = [];
  for (const batch of chunks(ids, BATCH_GET_LIMIT)) {
    let keys = batch.map((id) => ({ id: { S: id } }));
    for (let attempt = 0; keys.length > 0; attempt += 1) {
      const result = await send(
        batchGetDescriptor({
          RequestItems: {
            [tableName]: {
              Keys: keys,
              ConsistentRead: true,
            },
          },
        }),
      );
      for (const item of result.Responses?.[tableName] || []) rows.push(decodeItem(item));
      keys = result.UnprocessedKeys?.[tableName]?.Keys || [];
      if (keys.length === 0) break;
      if (attempt >= MAX_UNPROCESSED_RETRIES) {
        throw new Error(`User data export left ${keys.length} unprocessed telemetry records`);
      }
    }
  }
  return rows;
}

async function loadRawTelemetry(subject, send) {
  const rawEventIds = await loadTelemetryPointers(subject, send);
  if (rawEventIds.length === 0) return [];
  const expectedIds = new Set(rawEventIds);
  const tableName = requiredEnvironment("TELEMETRY_RAW_EVENT_TABLE_NAME");
  const rows = await batchGetRawTelemetry(tableName, rawEventIds, send);
  for (const row of rows) {
    if (row.tenantId !== subject.tenantId || !expectedIds.has(row.id)) {
      throw new Error("Telemetry export read escaped authenticated subject scope");
    }
  }
  return rows.map(cleanRow).sort((left, right) => (left.occurredAt || 0) - (right.occurredAt || 0));
}

async function loadCloudData(subject, send) {
  const entries = await Promise.all(
    PERSONAL_TABLES.map(async ([key, environmentName]) => [
      key,
      await scanPersonalTable(requiredEnvironment(environmentName), subject, send),
    ]),
  );
  const result = Object.fromEntries(entries);
  result.rawTelemetry = await loadRawTelemetry(subject, send);
  return result;
}

export function createUserDataExportHandler(send, now = () => Date.now()) {
  return async (event) => {
    const subject = caller(event);
    const context = await loadTransparencyContext(subject, send);
    const fieldName = event?.info?.fieldName;
    if (fieldName === "loadMyDataTransparencyContext") return context;
    if (fieldName !== "exportMyData") throw new Error("Unsupported user data export operation");

    return JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date(now()).toISOString(),
      subject,
      visibilityAndRetention: context,
      cloud: await loadCloudData(subject, send),
      excluded: {
        tenantAggregates: "Not person-specific and therefore not part of this own-data export.",
        authTokens: "Transient authentication credentials are never exported.",
      },
    });
  };
}

let awsSenderPromise;

async function awsSender() {
  if (!awsSenderPromise) {
    awsSenderPromise = import("@aws-sdk/client-dynamodb").then(
      ({ BatchGetItemCommand, DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand }) => {
        const client = new DynamoDBClient({});
        return (descriptor) => {
          if (descriptor.type === "get") return client.send(new GetItemCommand(descriptor.input));
          if (descriptor.type === "scan") return client.send(new ScanCommand(descriptor.input));
          if (descriptor.type === "query") return client.send(new QueryCommand(descriptor.input));
          if (descriptor.type === "batchGet") {
            return client.send(new BatchGetItemCommand(descriptor.input));
          }
          throw new Error("Unsupported user data export DynamoDB command");
        };
      },
    );
  }
  return awsSenderPromise;
}

export async function handler(event) {
  const send = await awsSender();
  return createUserDataExportHandler(send)(event);
}
