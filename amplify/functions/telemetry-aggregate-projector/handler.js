import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});
const RECEIPT_TTL_SECONDS = 2 * 24 * 60 * 60;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function requiredString(image, name) {
  const value = image?.[name]?.S;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Telemetry stream ${name} is invalid`);
  }
  return value;
}

function optionalString(image, name) {
  const value = image?.[name]?.S;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredNumber(image, name) {
  const raw = image?.[name]?.N;
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Telemetry stream ${name} is invalid`);
  return value;
}

function payloadObject(image) {
  const payload = image?.payload;
  if (payload?.M) return payload.M;
  if (typeof payload?.S === "string") {
    const parsed = JSON.parse(payload.S);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }
  return {};
}

function payloadString(payload, name) {
  const value = payload?.[name];
  if (typeof value === "string") return value;
  return typeof value?.S === "string" ? value.S : undefined;
}

function payloadNumber(payload, name) {
  const value = payload?.[name];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value?.N === "string") {
    const parsed = Number(value.N);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function encoded(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function utcDayStart(timestampMs) {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) throw new Error("Telemetry occurredAt is invalid");
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function contributionFor(image) {
  const eventType = requiredString(image, "eventType");
  const stepId = optionalString(image, "stepId");
  const payload = payloadObject(image);

  if (eventType === "analytics.session.started") {
    return { dimensionKey: "scenario", adds: { sessionsStarted: 1 } };
  }
  if (eventType === "analytics.session.completed") {
    const durationMs = payloadNumber(payload, "durationMs");
    return {
      dimensionKey: "scenario",
      adds: {
        sessionsCompleted: 1,
        ...(durationMs === undefined
          ? {}
          : { scenarioDurationTotalMs: Math.max(0, durationMs), scenarioDurationCount: 1 }),
      },
    };
  }
  if (eventType === "analytics.step.started" && stepId) {
    return {
      dimensionKey: `step:${encoded(stepId)}:started`,
      stepId,
      adds: { stepStartedCount: 1 },
    };
  }
  if (eventType === "analytics.step.completed" && stepId) {
    const durationMs = payloadNumber(payload, "durationMs");
    return {
      dimensionKey: `step:${encoded(stepId)}:completed`,
      stepId,
      adds: {
        stepCompletedCount: 1,
        ...(durationMs === undefined
          ? {}
          : { stepDurationTotalMs: Math.max(0, durationMs), stepDurationCount: 1 }),
      },
    };
  }
  if (eventType === "analytics.hint.used" && stepId) {
    return {
      dimensionKey: `step:${encoded(stepId)}:hint`,
      stepId,
      adds: { hintUsageCount: 1 },
    };
  }
  if (eventType === "analytics.attempt.recorded" && stepId) {
    const outcome = payloadString(payload, "outcome");
    if (outcome === "pass" || outcome === "PASS") return null;
    const normalizedOutcome = outcome || "unknown";
    const actionType = payloadString(payload, "actionType");
    const failurePattern = actionType ? `${actionType}:${normalizedOutcome}` : normalizedOutcome;
    return {
      dimensionKey: `step:${encoded(stepId)}:failure:${encoded(failurePattern)}`,
      stepId,
      failurePattern,
      adds: { failedAttemptCount: 1 },
    };
  }
  return null;
}

function aggregateUpdate(image, contribution) {
  const tenantId = requiredString(image, "tenantId");
  const tenantScenarioKey = requiredString(image, "tenantScenarioKey");
  const scenarioId = requiredString(image, "scenarioId");
  const occurredAt = requiredNumber(image, "occurredAt");
  const bucketStart = utcDayStart(occurredAt);
  const aggregateId = [
    "telemetry-aggregate:v1",
    encoded(tenantId),
    encoded(scenarioId),
    String(bucketStart),
    encoded(contribution.dimensionKey),
  ].join(".");

  const names = {
    "#tenantId": "tenantId",
    "#tenantScenarioKey": "tenantScenarioKey",
    "#scenarioId": "scenarioId",
    "#bucketStart": "bucketStart",
    "#dimensionKey": "dimensionKey",
    "#updatedAt": "projectionUpdatedAt",
  };
  const values = {
    ":tenantId": { S: tenantId },
    ":tenantScenarioKey": { S: tenantScenarioKey },
    ":scenarioId": { S: scenarioId },
    ":bucketStart": { N: String(bucketStart) },
    ":dimensionKey": { S: contribution.dimensionKey },
    ":updatedAt": { N: String(Date.now()) },
  };
  const setParts = [
    "#tenantId = if_not_exists(#tenantId, :tenantId)",
    "#tenantScenarioKey = if_not_exists(#tenantScenarioKey, :tenantScenarioKey)",
    "#scenarioId = if_not_exists(#scenarioId, :scenarioId)",
    "#bucketStart = if_not_exists(#bucketStart, :bucketStart)",
    "#dimensionKey = if_not_exists(#dimensionKey, :dimensionKey)",
    "#updatedAt = :updatedAt",
  ];

  if (contribution.stepId) {
    names["#stepId"] = "stepId";
    values[":stepId"] = { S: contribution.stepId };
    setParts.push("#stepId = if_not_exists(#stepId, :stepId)");
  }
  if (contribution.failurePattern) {
    names["#failurePattern"] = "failurePattern";
    values[":failurePattern"] = { S: contribution.failurePattern };
    setParts.push("#failurePattern = if_not_exists(#failurePattern, :failurePattern)");
  }

  const addParts = [];
  for (const [field, amount] of Object.entries(contribution.adds)) {
    const nameKey = `#add_${field}`;
    const valueKey = `:add_${field}`;
    names[nameKey] = field;
    values[valueKey] = { N: String(amount) };
    addParts.push(`${nameKey} ${valueKey}`);
  }

  return {
    TableName: requiredEnvironment("TELEMETRY_AGGREGATE_TABLE_NAME"),
    Key: { id: { S: aggregateId } },
    UpdateExpression: `SET ${setParts.join(", ")} ADD ${addParts.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

async function projectionReceiptExists(receiptId) {
  const result = await client.send(
    new GetItemCommand({
      TableName: requiredEnvironment("TELEMETRY_PROJECTION_RECEIPT_TABLE_NAME"),
      Key: { id: { S: receiptId } },
      ProjectionExpression: "id",
      ConsistentRead: true,
    }),
  );
  return Boolean(result.Item?.id?.S);
}

async function projectRecord(record) {
  if (record.eventName !== "INSERT" || !record.dynamodb?.NewImage) return;
  const contribution = contributionFor(record.dynamodb.NewImage);
  if (!contribution) return;
  if (!record.eventID) throw new Error("Telemetry stream record has no eventID");

  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const receiptId = `telemetry-projection-receipt:v1:${record.eventID}`;
  try {
    await client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: requiredEnvironment("TELEMETRY_PROJECTION_RECEIPT_TABLE_NAME"),
              Item: {
                id: { S: receiptId },
                expiresAtEpochSeconds: { N: String(nowEpochSeconds + RECEIPT_TTL_SECONDS) },
              },
              ConditionExpression: "attribute_not_exists(id)",
            },
          },
          { Update: aggregateUpdate(record.dynamodb.NewImage, contribution) },
        ],
      }),
    );
  } catch (error) {
    if (
      error?.name === "TransactionCanceledException" &&
      (await projectionReceiptExists(receiptId))
    ) {
      return;
    }
    throw error;
  }
}

export const handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event.Records || []) {
    try {
      await projectRecord(record);
    } catch (error) {
      console.error("Telemetry aggregate projection failed", {
        eventID: record.eventID,
        error: error instanceof Error ? error.message : String(error),
      });
      if (record.eventID) batchItemFailures.push({ itemIdentifier: record.eventID });
    }
  }
  return { batchItemFailures };
};
