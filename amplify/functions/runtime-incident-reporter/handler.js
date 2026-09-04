import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  buildRuntimeIncidentIssue,
  fingerprintRuntimeIncident,
  sanitizeRuntimeIncident,
} from "./incident.js";

const ddb = new DynamoDBClient({});
const FAILURE_THRESHOLD = 5;
const CIRCUIT_MS = 5 * 60_000;

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

function toItem(fingerprint, aggregate) {
  const item = {
    fingerprint: { S: fingerprint },
    count: { N: String(aggregate.count) },
    firstSeen: { S: aggregate.firstSeen },
    lastSeen: { S: aggregate.lastSeen },
    deliveryFailures: { N: String(aggregate.deliveryFailures ?? 0) },
    circuitUntil: { N: String(aggregate.circuitUntil ?? 0) },
  };
  if (aggregate.issueNumber) item.issueNumber = { N: String(aggregate.issueNumber) };
  return item;
}

async function githubRequest(path, method, body) {
  const token = requiredEnvironment("RUNTIME_INCIDENT_GITHUB_TOKEN");
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub incident adapter failed with ${response.status}`);
  return response.json();
}

async function deliver(issue, issueNumber) {
  const repository = requiredEnvironment("RUNTIME_INCIDENT_GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("Invalid incident repository allowlist");
  }
  const base = `/repos/${repository}/issues`;
  if (issueNumber) return githubRequest(`${base}/${issueNumber}`, "PATCH", issue);
  return githubRequest(base, "POST", issue);
}

export async function handler(event) {
  const tableName = requiredEnvironment("RUNTIME_INCIDENT_TABLE_NAME");
  const safe = sanitizeRuntimeIncident(event?.incident);
  const fingerprint = fingerprintRuntimeIncident(safe);
  const now = Date.now();
  const existing = fromItem(
    (
      await ddb.send(
        new GetItemCommand({
          TableName: tableName,
          Key: { fingerprint: { S: fingerprint } },
          ConsistentRead: true,
        }),
      )
    ).Item,
  );
  const aggregate = {
    count: (existing?.count ?? 0) + 1,
    firstSeen: existing?.firstSeen ?? iso(now),
    lastSeen: iso(now),
    issueNumber: existing?.issueNumber ?? null,
    deliveryFailures: existing?.deliveryFailures ?? 0,
    circuitUntil: existing?.circuitUntil ?? 0,
  };

  // Persist evidence before external delivery so a GitHub outage cannot erase occurrence history.
  await ddb.send(new PutItemCommand({ TableName: tableName, Item: toItem(fingerprint, aggregate) }));
  if (aggregate.circuitUntil > now) {
    return { recorded: true, delivered: false, reason: "circuit-open", fingerprint };
  }

  try {
    const issue = buildRuntimeIncidentIssue(safe, aggregate);
    const delivered = await deliver(issue, aggregate.issueNumber);
    aggregate.issueNumber = Number(delivered.number);
    aggregate.deliveryFailures = 0;
    aggregate.circuitUntil = 0;
    await ddb.send(new PutItemCommand({ TableName: tableName, Item: toItem(fingerprint, aggregate) }));
    return { recorded: true, delivered: true, fingerprint };
  } catch (error) {
    aggregate.deliveryFailures += 1;
    if (aggregate.deliveryFailures >= FAILURE_THRESHOLD) aggregate.circuitUntil = now + CIRCUIT_MS;
    await ddb.send(new PutItemCommand({ TableName: tableName, Item: toItem(fingerprint, aggregate) }));
    console.error("Runtime incident delivery failed", {
      fingerprint,
      error: error instanceof Error ? error.message : "unknown delivery error",
    });
    return { recorded: true, delivered: false, reason: "delivery-failed", fingerprint };
  }
}
