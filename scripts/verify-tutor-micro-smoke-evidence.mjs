#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const APP_ID = process.env.AMPLIFY_APP_ID?.trim();
const CONTEXT_FILE = process.env.TUTOR_SMOKE_CONTEXT_FILE?.trim();
const REQUEST_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SUBJECT = /^[0-9a-f-]{36}$/i;
const LOCAL_MODEL = "gemma4:e4b@local";
const LOCAL_ROUTE = "local:gemma4:e4b";
const EXPECTED_NODE = "mi-0c4f95e235b575da9";

if (!APP_ID) throw new Error("AMPLIFY_APP_ID is required");
if (!CONTEXT_FILE) throw new Error("TUTOR_SMOKE_CONTEXT_FILE is required");

const context = JSON.parse(readFileSync(CONTEXT_FILE, "utf8"));
if (!SUBJECT.test(context.sub ?? "")) throw new Error("Tutor smoke context has an invalid subject");
if (!Number.isSafeInteger(context.startedAtMs) || context.startedAtMs <= 0) {
  throw new Error("Tutor smoke context has an invalid start time");
}

function aws(...args) {
  const output = execFileSync("aws", [...args, "--region", REGION, "--output", "json"], {
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  return JSON.parse(output);
}

function payload(message) {
  const start = String(message ?? "").indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(String(message).slice(start));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description, timeoutMs, read) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== null) return value;
    await sleep(5_000);
  }
  throw new Error(description + " was not observable before the read-only evidence deadline");
}

function logEvents(logGroup, pattern) {
  const found = aws(
    "logs",
    "filter-log-events",
    "--log-group-name",
    logGroup,
    "--start-time",
    String(context.startedAtMs),
    "--filter-pattern",
    pattern,
  );
  return found.events ?? [];
}

const ssrGroup = "/aws/amplify/" + APP_ID;
function matchingAudits() {
  return logEvents(ssrGroup, '"[tutor-llm]"')
    .map((event) => ({ event, entry: payload(event.message) }))
    .filter(({ entry }) => {
      const key = typeof entry?.sessionKey === "string" ? entry.sessionKey : "";
      return key.endsWith(":" + context.sub);
    });
}

const audits = await waitFor("SSR tutor audit", 90_000, () => {
  const found = matchingAudits();
  return found.length > 0 ? found : null;
});
if (audits.length !== 1) {
  throw new Error(
    "Expected exactly one SSR tutor audit for the smoke identity, found " + audits.length,
  );
}
const audit = audits[0].entry;
if (audit.status !== "completed") {
  throw new Error(
    "Tutor smoke did not produce a completed server LLM answer; deterministic fallback is not accepted",
  );
}
if (!REQUEST_ID.test(audit.requestId ?? "")) {
  throw new Error("Completed SSR tutor audit has no valid request ID");
}
const requestId = audit.requestId;

const relayPrefix = "/aws/lambda/amplify-" + APP_ID + "-";
const relayGroups =
  aws(
    "logs",
    "describe-log-groups",
    "--log-group-name-prefix",
    relayPrefix,
    "--query",
    "logGroups[?contains(logGroupName, 'tutorrelay')].logGroupName",
  ) ?? [];
if (!Array.isArray(relayGroups) || relayGroups.length === 0) {
  throw new Error("Tutor relay log group is not readable");
}

function matchingRelayEvents() {
  return relayGroups.flatMap((group) =>
    logEvents(group, '"' + requestId + '"')
      .map((event) => ({ event, entry: payload(event.message) }))
      .filter(({ entry }) => entry?.component === "tutor-relay" && entry.id === requestId),
  );
}

const relays = await waitFor("Tutor relay evidence", 90_000, () => {
  const found = matchingRelayEvents();
  return found.length > 0 ? found : null;
});
if (relays.length !== 1) {
  throw new Error(
    "Expected exactly one relay result for the smoke request, found " + relays.length,
  );
}
const relay = relays[0].entry;
const attempts = Array.isArray(relay.attempts) ? relay.attempts : [];
if (
  relay.outcome !== "completed" ||
  relay.model !== LOCAL_MODEL ||
  relay.route !== LOCAL_ROUTE ||
  attempts.length !== 1 ||
  attempts[0]?.model !== LOCAL_MODEL ||
  attempts[0]?.status !== 200
) {
  throw new Error("Tutor smoke did not stay on the single local beta model attempt");
}
if (typeof relay.commandId !== "string" || relay.commandId.length === 0) {
  throw new Error("Relay evidence has no SSM command ID");
}

function matchingCommands() {
  const trail = aws(
    "cloudtrail",
    "lookup-events",
    "--lookup-attributes",
    "AttributeKey=EventName,AttributeValue=SendCommand",
    "--start-time",
    new Date(context.startedAtMs - 60_000).toISOString(),
    "--max-items",
    "500",
  );
  return (trail.Events ?? [])
    .map((event) => {
      try {
        return JSON.parse(event.CloudTrailEvent)?.responseElements?.command ?? null;
      } catch {
        return null;
      }
    })
    .filter((command) => command?.comment === "tutor-relay " + requestId);
}

const commands = await waitFor("SSM SendCommand audit evidence", 600_000, () => {
  const found = matchingCommands();
  return found.length > 0 ? found : null;
});
if (commands.length !== 1) {
  throw new Error(
    "Expected exactly one SSM command for the smoke request, found " + commands.length,
  );
}
const command = commands[0];
if (command.commandId !== relay.commandId) {
  throw new Error("Relay and SSM command IDs do not match for the smoke request");
}
if (!Array.isArray(command.instanceIds) || !command.instanceIds.includes(EXPECTED_NODE)) {
  throw new Error("SSM evidence does not target the expected tutor managed node");
}

const finalAudits = matchingAudits();
if (finalAudits.length !== 1) {
  throw new Error("More than one server tutor request was observed for the smoke identity");
}

const summary = [
  "### Tutor micro smoke",
  "",
  "- authenticated public Tutor path: `passed`",
  "- request ID: `" + requestId + "`",
  "- SSR audit: `completed` (deterministic fallback alone is rejected)",
  "- relay model: `" + LOCAL_MODEL + "`",
  "- relay route: `" + LOCAL_ROUTE + "`",
  "- relay attempts: `1`",
  "- SSM command correlation: `" + command.commandId + "`",
  "- automatic model-request retries: `0`",
  "",
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
}
console.log(
  "Tutor micro smoke passed: requestId=" +
    requestId +
    " model=" +
    LOCAL_MODEL +
    " route=" +
    LOCAL_ROUTE +
    " attempts=1",
);
