#!/usr/bin/env node
// Follows one tutor request through its three traces (#482): the audit of the server function, the
// relay Lambda and the SSM command on the RMI-PC. The command's comment comes from CloudTrail,
// which shows it after a few minutes.
//
//   npm run trace:tutor-request                 # latest tutor request of the last 24 hours
//   npm run trace:tutor-request -- <requestId>
//
// Needs an AWS CLI profile with read access to Amplify, CloudWatch Logs and CloudTrail.
// AMPLIFY_APP_ID overrides the lookup of the app by repository name.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const REPOSITORY = "ai-tutor-lab";
const REQUEST_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const { positionals } = parseArgs({ allowPositionals: true });

function aws(...args) {
  const output = execFileSync("aws", [...args, "--region", REGION, "--output", "json"], {
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  return JSON.parse(output);
}

const appId =
  process.env.AMPLIFY_APP_ID ??
  aws("amplify", "list-apps", "--query", `apps[?ends_with(repository, '/${REPOSITORY}')].appId`)[0];
if (!appId) throw new Error("Amplify-App nicht gefunden; AMPLIFY_APP_ID setzen");
const since = Date.now() - 24 * 60 * 60 * 1000;

function logEvents(logGroup, pattern) {
  const found = aws(
    "logs",
    "filter-log-events",
    "--log-group-name",
    logGroup,
    "--start-time",
    String(since),
    "--filter-pattern",
    pattern,
  );
  return found.events ?? [];
}

function payload(message) {
  try {
    return JSON.parse(message.slice(message.indexOf("{")));
  } catch {
    return null;
  }
}

function time(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19);
}

const ssrGroup = `/aws/amplify/${appId}`;
let requestId = positionals[0];
if (!requestId) {
  const latest = logEvents(ssrGroup, '"[tutor-llm]" "requestId"')
    .map((event) => payload(event.message))
    .filter((entry) => entry?.requestId)
    .at(-1);
  if (!latest) throw new Error("Keine Tutor-Anfrage mit Request-ID in den letzten 24 Stunden");
  requestId = latest.requestId;
}
if (!REQUEST_ID.test(requestId)) throw new Error("Die Request-ID muss eine UUID sein");
console.log(`Request-ID ${requestId}`);

// The audit's session key names the user; only status, model and tenant reference are shown.
const ssr = logEvents(ssrGroup, `"${requestId}"`)
  .map((event) => ({ event, entry: payload(event.message) }))
  .filter(({ entry }) => entry?.requestId === requestId);
for (const { event, entry } of ssr) {
  console.log(
    `  SSR    ${time(event.timestamp)}  status=${entry.status} model=${entry.model} tenantRef=${entry.tenantRef}`,
  );
}
if (ssr.length === 0) console.log("  SSR    kein Eintrag");

const [relayGroup] = aws(
  "logs",
  "describe-log-groups",
  "--log-group-name-prefix",
  `/aws/lambda/amplify-${appId}-`,
  "--query",
  "logGroups[?contains(logGroupName, 'tutorrelay')].logGroupName",
);
const relay = relayGroup
  ? logEvents(relayGroup, `"${requestId}"`)
      .map((event) => ({ event, entry: payload(event.message) }))
      .filter(({ entry }) => entry?.component === "tutor-relay" && entry.id === requestId)
  : [];
for (const { event, entry } of relay) {
  console.log(
    `  Relay  ${time(event.timestamp)}  outcome=${entry.outcome} failure=${entry.failure ?? "-"} tenantRef=${entry.tenantRef ?? "-"} commandId=${entry.commandId ?? "-"}`,
  );
}
if (relay.length === 0) console.log("  Relay  kein Eintrag");

const trail = aws(
  "cloudtrail",
  "lookup-events",
  "--lookup-attributes",
  "AttributeKey=EventName,AttributeValue=SendCommand",
  "--start-time",
  new Date(since).toISOString(),
  "--max-items",
  "500",
);
const commands = (trail.Events ?? [])
  .map((event) => ({
    event,
    command: JSON.parse(event.CloudTrailEvent)?.responseElements?.command,
  }))
  .filter(({ command }) => command?.comment === `tutor-relay ${requestId}`);
for (const { event, command } of commands) {
  console.log(
    `  SSM    ${time(event.EventTime * 1000)}  commandId=${command.commandId} comment="${command.comment}"`,
  );
}
if (commands.length === 0)
  console.log("  SSM    noch kein CloudTrail-Eintrag (erscheint nach einigen Minuten)");
