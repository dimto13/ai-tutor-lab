#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const APP_ID = process.env.AMPLIFY_APP_ID?.trim();
const WINDOW_HOURS = Number.parseInt(process.env.WINDOW_HOURS ?? "", 10);
const LOCAL_MODEL = "gemma4:e4b@local";
const LOCAL_ROUTE = "local:gemma4:e4b";

if (!APP_ID) throw new Error("AMPLIFY_APP_ID is required");
if (!Number.isSafeInteger(WINDOW_HOURS) || WINDOW_HOURS <= 0) {
  throw new Error("WINDOW_HOURS must be a positive integer");
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

const prefix = "/aws/lambda/amplify-" + APP_ID + "-";
const relayGroups =
  aws(
    "logs",
    "describe-log-groups",
    "--log-group-name-prefix",
    prefix,
    "--query",
    "logGroups[?contains(logGroupName, 'tutorrelay')].logGroupName",
  ) ?? [];

if (!Array.isArray(relayGroups) || relayGroups.length === 0) {
  throw new Error("No readable tutor relay log group was found");
}

const startTime = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;
const evidence = [];
for (const group of relayGroups) {
  const result = aws(
    "logs",
    "filter-log-events",
    "--log-group-name",
    group,
    "--start-time",
    String(startTime),
    "--filter-pattern",
    '"tutor-relay"',
  );
  for (const event of result.events ?? []) {
    const entry = payload(event.message);
    if (entry?.component !== "tutor-relay") continue;
    if (!Array.isArray(entry.attempts)) continue;
    evidence.push(entry);
  }
}

if (evidence.length === 0) {
  const summary = [
    "### Passive tutor route evidence",
    "",
    "- recent tutor model-route evidence: `none in window`",
    "- infrastructure state: `not inferred from missing traffic`",
    "- model requests created by this check: `0`",
    "",
  ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
  }
  console.log("No recent tutor model-route evidence; passive check remains traffic-neutral.");
  process.exit(0);
}

let completed = 0;
for (const entry of evidence) {
  const attempts = entry.attempts;
  if (attempts.length === 0) {
    throw new Error("Observed tutor relay evidence has no classifiable model attempt");
  }
  for (const attempt of attempts) {
    if (attempt?.model !== LOCAL_MODEL) {
      throw new Error(
        "Observed non-local tutor model attempt: " + String(attempt?.model ?? "missing"),
      );
    }
  }
  if (entry.outcome === "completed") {
    completed += 1;
    if (entry.model !== LOCAL_MODEL || entry.route !== LOCAL_ROUTE) {
      throw new Error(
        "Completed tutor evidence did not use the required local beta model and route",
      );
    }
  }
}

const summary = [
  "### Passive tutor route evidence",
  "",
  "- relay request records observed: `" + evidence.length + "`",
  "- completed local tutor records: `" + completed + "`",
  "- allowed model: `" + LOCAL_MODEL + "`",
  "- allowed completed route: `" + LOCAL_ROUTE + "`",
  "- cloud model attempts observed: `0`",
  "- model requests created by this check: `0`",
  "",
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
}
console.log(
  "Passive tutor evidence is local-only: records=" + evidence.length + " completed=" + completed,
);
