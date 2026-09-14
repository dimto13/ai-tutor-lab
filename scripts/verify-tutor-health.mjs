#!/usr/bin/env node
// Asks the deployed tutor relay how every station of the tutor path is doing (#480): SSM to the
// RMI-PC, SSH to the NAS, the ollama-rotator, its cloud route, Ollama on the RMI-PC and the models.
//
//   npm run verify:tutor-health -- --app https://<app-domain>   # relay URL from amplify_outputs.json
//   npm run verify:tutor-health -- --url <relay function URL>
//
// The bearer is derived from the relay secret in TUTOR_RELAY_KEY or
// ~/.config/trainlabs-tutor-relay/master.key. The exit code is 0 only for `ok`.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { deriveRelayKeys } from "../amplify/functions/tutor-relay/keys.js";

const { values } = parseArgs({
  options: {
    app: { type: "string", default: process.env.TRAINLABS_APP_URL },
    url: { type: "string", default: process.env.TUTOR_RELAY_URL },
  },
});

async function relayUrl() {
  if (values.url) return values.url;
  if (!values.app) throw new Error("--app <App-URL> oder --url <Relay-URL> angeben");
  const response = await fetch(new URL("/amplify_outputs.json", values.app));
  if (!response.ok) throw new Error(`amplify_outputs.json: HTTP ${response.status}`);
  const url = (await response.json())?.custom?.tutorRelayUrl;
  if (typeof url !== "string" || !url) {
    throw new Error("amplify_outputs.json enthält keine custom.tutorRelayUrl");
  }
  return url;
}

async function masterKey() {
  if (process.env.TUTOR_RELAY_KEY) return process.env.TUTOR_RELAY_KEY;
  const path = join(homedir(), ".config/trainlabs-tutor-relay/master.key");
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    throw new Error(`Relay-Schlüssel fehlt: TUTOR_RELAY_KEY setzen oder ${path} anlegen`);
  }
}

const { bearer } = deriveRelayKeys(await masterKey());

const startedAt = Date.now();
const base = await relayUrl();
// Without a trailing slash, "health" would replace the last path segment of the base.
const response = await fetch(new URL("health", base.endsWith("/") ? base : `${base}/`), {
  headers: { authorization: `Bearer ${bearer}` },
  signal: AbortSignal.timeout(40_000),
});
const text = await response.text();
let report = null;
try {
  report = JSON.parse(text);
} catch {
  // Reported below together with the HTTP status.
}
if (!report?.checks) {
  console.error(`HTTP ${response.status}: ${report?.error?.message ?? text.slice(0, 200)}`);
  process.exit(1);
}

// An older or foreign relay may leave fields out; they show as "unknown" instead of failing here.
const { checks } = report;
const httpStatus = (check) => check?.httpStatus !== undefined && `HTTP ${check.httpStatus}`;
const lines = [
  [
    "SSM → RMI-PC",
    checks.ssm,
    [
      checks.ssm?.pingStatus,
      checks.ssm?.agentVersion && `Agent ${checks.ssm.agentVersion}`,
      checks.ssm?.error,
    ],
  ],
  ["SSH → NAS", checks.sshNas, [checks.sshNas?.error]],
  [
    "Rotator",
    checks.rotator,
    [
      checks.rotator?.cloudAccounts !== undefined &&
        `Cloud-Konten frei ${checks.rotator.cloudAccountsFree}/${checks.rotator.cloudAccounts}`,
      httpStatus(checks.rotator),
    ],
  ],
  ["Cloud-Route", checks.cloudRoute, [checks.cloudRoute?.error, httpStatus(checks.cloudRoute)]],
  ["Ollama RMI-PC", checks.ollama, [checks.ollama?.version]],
];
for (const [role, model] of Object.entries(checks.models ?? {})) {
  if (!model) continue;
  lines.push([
    role === "primary" ? "Modell primär" : "Modell Fallback",
    model,
    [
      `${model.name} (${model.route === "local" ? "lokal" : "Cloud"})`,
      model.loaded === true && "geladen",
      model.loaded === false && "nicht geladen",
    ],
  ]);
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Tutor-Health: ${report.status} · HTTP ${response.status} · ${seconds} s`);
for (const [label, check, details] of lines) {
  const status = String(check?.status ?? "unknown").padEnd(9);
  console.log(`  ${label.padEnd(16)} ${status} ${details.filter(Boolean).join(" · ")}`);
}
process.exitCode = report.status === "ok" ? 0 : 1;
