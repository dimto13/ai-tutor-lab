import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  buildRuntimeIncidentIssue,
  fingerprintRuntimeIncident,
  sanitizeRuntimeIncident,
} from "./incident.js";

const ddb = new DynamoDBClient({});
const FAILURE_THRESHOLD = 5;
const CIRCUIT_MS = 5 * 60_000;
const DELIVERY_LEASE_MS = 30_000;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function iso(value) {
  return new Date(value).toISOString();
}

function fromItem(item) {
  if (!item) return null;
  return {
    count: Number(item.count?.N ?? 0),
    firstSeen: item.firstSeen?.S,
    lastSeen: item.lastSeen?.S,
    issueNumber: item.issueNumber?.N ? Number(item.issueNumber.N) : null,
    deliveryFailures: Number(item.deliveryFailures?.N ?? 0),
    circuitUntil: Number(item.circuitUntil?.N ?? 0),
  };
}

async function recordOccurrence(tableName, fingerprint, now) {
  const result = await ddb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { fingerprint: { S: fingerprint } },
      UpdateExpression:
        "ADD #count :one SET firstSeen = if_not_exists(firstSeen, :seen), lastSeen = :seen, deliveryFailures = if_not_exists(deliveryFailures, :zero), circuitUntil = if_not_exists(circuitUntil, :zero)",
      ExpressionAttributeNames: { "#count": "count" },
      ExpressionAttributeValues: {
        ":one": { N: "1" },
        ":zero": { N: "0" },
        ":seen": { S: iso(now) },
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  return fromItem(result.Attributes);
}

async function claimDelivery(tableName, fingerprint, now) {
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { fingerprint: { S: fingerprint } },
        UpdateExpression: "SET deliveryLeaseUntil = :leaseUntil",
        ConditionExpression:
          "circuitUntil <= :now AND (attribute_not_exists(deliveryLeaseUntil) OR deliveryLeaseUntil <= :now)",
        ExpressionAttributeValues: {
          ":now": { N: String(now) },
          ":leaseUntil": { N: String(now + DELIVERY_LEASE_MS) },
        },
      }),
    );
    return true;
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

async function githubRequest(path, method, body) {
  const token = requiredEnvironment("RUNTIME_INCIDENT_GITHUB_TOKEN");
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "ai-tutor-lab-runtime-incident-reporter",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`GitHub incident adapter failed with ${response.status}`);
  }
  return response.json();
}

async function deliver(issue, issueNumber) {
  const repository = requiredEnvironment("RUNTIME_INCIDENT_GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("Invalid incident repository allowlist");
  }
  const base = `/repos/${repository}/issues`;
  if (issueNumber) {
    return githubRequest(`${base}/${issueNumber}`, "PATCH", { ...issue, state: "open" });
  }
  return githubRequest(base, "POST", issue);
}

async function markDeliverySuccess(tableName, fingerprint, issueNumber) {
  await ddb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { fingerprint: { S: fingerprint } },
      UpdateExpression:
        "SET issueNumber = :issueNumber, deliveryFailures = :zero, circuitUntil = :zero REMOVE deliveryLeaseUntil",
      ExpressionAttributeValues: {
        ":issueNumber": { N: String(issueNumber) },
        ":zero": { N: "0" },
      },
    }),
  );
}

async function markDeliveryFailure(tableName, fingerprint, now) {
  const result = await ddb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { fingerprint: { S: fingerprint } },
      UpdateExpression: "ADD deliveryFailures :one REMOVE deliveryLeaseUntil",
      ExpressionAttributeValues: { ":one": { N: "1" } },
      ReturnValues: "ALL_NEW",
    }),
  );
  const failures = Number(result.Attributes?.deliveryFailures?.N ?? 1);
  if (failures >= FAILURE_THRESHOLD) {
    await ddb.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { fingerprint: { S: fingerprint } },
        UpdateExpression: "SET circuitUntil = :until",
        ExpressionAttributeValues: { ":until": { N: String(now + CIRCUIT_MS) } },
      }),
    );
  }
}

export async function handler(event) {
  const tableName = requiredEnvironment("RUNTIME_INCIDENT_TABLE_NAME");
  const safe = sanitizeRuntimeIncident(event?.incident);
  const fingerprint = fingerprintRuntimeIncident(safe);
  const now = Date.now();

  // Atomic write-ahead aggregation preserves every occurrence under Lambda concurrency.
  const aggregate = await recordOccurrence(tableName, fingerprint, now);
  if (!aggregate) throw new Error("Runtime incident aggregate was not persisted");

  // Persistent conditional admission prevents concurrent Lambdas from creating duplicate issues.
  // A held lease also rate-limits external delivery while occurrences continue to aggregate.
  if (!(await claimDelivery(tableName, fingerprint, now))) {
    const reason = aggregate.circuitUntil > now ? "circuit-open" : "rate-limited";
    return { recorded: true, delivered: false, reason, fingerprint };
  }

  try {
    const issue = buildRuntimeIncidentIssue(safe, aggregate);
    const delivered = await deliver(issue, aggregate.issueNumber);
    await markDeliverySuccess(tableName, fingerprint, Number(delivered.number));
    return { recorded: true, delivered: true, fingerprint };
  } catch (error) {
    await markDeliveryFailure(tableName, fingerprint, now);
    console.error("Runtime incident delivery failed", {
      fingerprint,
      error: error instanceof Error ? error.message : "unknown delivery error",
    });
    return { recorded: true, delivered: false, reason: "delivery-failed", fingerprint };
  }
}
