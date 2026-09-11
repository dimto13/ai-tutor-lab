#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const CLOUDTRAIL_EVENT_HISTORY_DAYS = 90;
const DYNAMODB_SCAN_NOTICE =
  "DynamoDB-Daten werden per vollständigem Scan gelesen. Das ist ausschließlich eine manuelle Owner/Admin-Operation für den kleinen Beta-Bestand, verbraucht Read Capacity und skaliert mit der Tabellengröße. Nicht automatisch schedulen und nicht aus einem Produkt-Request-Pfad aufrufen.";
const CLOUDTRAIL_NOTICE = `CloudTrail lookup-events liefert nur die Event-History innerhalb des AWS-Zeitfensters (typischerweise bis zu ${CLOUDTRAIL_EVENT_HISTORY_DAYS} Tage) und unterliegt API-Rate-Limits. Die Login-Liste ist deshalb keine unbegrenzte oder garantiert vollständige Historie.`;

const options = {
  output: { type: "string", short: "o", default: "platform-monitoring.json" },
  region: { type: "string", short: "r" },
  profile: { type: "string", short: "p" },
  "app-id": { type: "string", short: "a" },
  branch: { type: "string", short: "b" },
  "user-pool-id": { type: "string", short: "u" },
  "api-id": { type: "string" },
  view: { type: "string", default: "all" },
  "test-emails": { type: "string" },
  verbose: { type: "boolean", short: "v", default: false },
  quiet: { type: "boolean", short: "q", default: false },
  "mask-emails": { type: "boolean", default: false },
  "list-emails": { type: "boolean", default: false },
  logins: { type: "boolean", short: "l", default: false },
  timeline: { type: "boolean", short: "t", default: false },
  user: { type: "string" },
  help: { type: "boolean", short: "h", default: false },
};

function printHelp() {
  console.log(`
Plattform- & Interaktions-Monitoring Dashboard

Owner-/Admin-Tooling für vorhandene AWS-Betriebs- und Interaktionsdaten.
Trennt Kunden-Nutzer von internen Test-/Entwicklungs-Accounts und schreibt lokal
nach platform-monitoring.json. Das Tool ist kein Produkt-Request-Pfad und wird
nicht automatisch pro Nutzerrequest oder als dauerhafter Scheduler ausgeführt.

Verwendung:
  npm run platform:monitoring [-- [Optionen]]
  sh scripts/platform-monitoring.sh [Optionen]
  node scripts/extract-platform-monitoring.mjs [Optionen]

Optionen:
  -o, --output <datei>       Pfad zur Zieldatei (Standard: platform-monitoring.json)
  -r, --region <region>      AWS-Region (Standard: AWS_REGION oder 'us-east-1')
  -p, --profile <profil>     AWS-Profil (Standard: AWS_PROFILE)
  -a, --app-id <id>          Amplify App-ID (Standard: automatische Ermittlung)
  -b, --branch <name>        Amplify Branch (Standard: AMPLIFY_BRANCH oder 'deploy')
  -u, --user-pool-id <id>    Cognito User Pool ID (Standard: automatische Ermittlung)
      --api-id <id>          AppSync API ID (Standard: automatische Ermittlung)
      --view <bereich>       'all' (Standard), 'customers' oder 'tests'
      --test-emails <liste>  Zusätzliche Test-E-Mails, kommagetrennt. Alternativ:
                             PLATFORM_MONITORING_TEST_EMAILS. Keine realen Test-
                             Adressen als statische Defaults im Repository.
      --mask-emails          E-Mail-Adressen in Ausgabe/Report maskieren
      --list-emails          Nur registrierte E-Mails ausgeben
  -l, --logins               Einzelne gefundene Login-Zeitpunkte ausgeben
  -t, --timeline             Fokus auf Registrierungsverlauf
      --user <email|id>      Filter auf einen Benutzer
  -v, --verbose              Discovery-/Ladedetails anzeigen
  -q, --quiet                Keine Konsolenausgabe, nur JSON schreiben
  -h, --help                 Diese Hilfe anzeigen

Betriebs- und Datenquellengrenzen:
  * ${DYNAMODB_SCAN_NOTICE}
  * ${CLOUDTRAIL_NOTICE}
`);
}

let parsedArgs;
try {
  parsedArgs = parseArgs({ options, allowPositionals: false });
} catch (error) {
  console.error(`Fehler beim Parsen der Argumente: ${error.message}`);
  printHelp();
  process.exit(1);
}

const { values } = parsedArgs;

if (values.help) {
  printHelp();
  process.exit(0);
}

const region = values.region || process.env.AWS_REGION || "us-east-1";
const profile = values.profile || process.env.AWS_PROFILE;
const targetBranch = values.branch || process.env.AMPLIFY_BRANCH || "deploy";
const outputPath = resolve(process.cwd(), values.output);
const quiet = Boolean(values.quiet);
const verbose = Boolean(values.verbose);
const maskEmails = Boolean(values["mask-emails"]);
const viewMode = (values.view || "all").toLowerCase();
const showLogins = Boolean(values.logins);
const showTimeline = Boolean(values.timeline);
const filterUser = values.user ? values.user.trim().toLowerCase() : null;

if (!["all", "customers", "tests"].includes(viewMode)) {
  console.error("FEHLER: --view muss 'all', 'customers' oder 'tests' sein.");
  process.exit(1);
}

function parseConfiguredTestEmails(...sources) {
  const result = new Set();
  for (const source of sources) {
    if (!source) continue;
    for (const email of String(source).split(",")) {
      const normalized = email.trim().toLowerCase();
      if (normalized) result.add(normalized);
    }
  }
  return result;
}

const customTestEmails = parseConfiguredTestEmails(
  process.env.PLATFORM_MONITORING_TEST_EMAILS,
  values["test-emails"],
);

function isTestAccount(email, tenantId) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (customTestEmails.has(normalizedEmail)) return true;
  if (normalizedEmail.endsWith("@example.com")) return true;
  if (normalizedEmail.includes("+cloud-acceptance@")) return true;
  if (normalizedEmail.startsWith("deletable_")) return true;
  if (tenantId && String(tenantId).startsWith("cloud-acceptance")) return true;
  return false;
}

function debugLog(...messages) {
  if (verbose && !quiet) console.log(...messages);
}

function logError(...messages) {
  console.error(...messages);
}

function runAws(args) {
  const fullArgs = [...args];
  if (region) fullArgs.push("--region", region);
  if (profile) fullArgs.push("--profile", profile);
  fullArgs.push("--output", "json");

  try {
    const raw = execFileSync("aws", fullArgs, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  } catch (error) {
    const stderr = error.stderr?.toString() || error.message;
    throw new Error(`AWS CLI Aufruf fehlgeschlagen (aws ${args.join(" ")}):\n${stderr}`);
  }
}

function checkAwsCli() {
  try {
    execFileSync("aws", ["--version"], { stdio: "ignore" });
  } catch {
    logError("FEHLER: 'aws' CLI ist nicht installiert oder nicht im PATH verfügbar.");
    process.exit(1);
  }

  try {
    runAws(["sts", "get-caller-identity"]);
  } catch (error) {
    logError("FEHLER: Keine gültigen AWS-Anmeldeinformationen gefunden.");
    logError(error.message);
    process.exit(1);
  }
}

function unmarshall(value) {
  if (!value || typeof value !== "object") return value;
  if ("S" in value) return value.S;
  if ("N" in value) return Number(value.N);
  if ("B" in value) return value.B;
  if ("BOOL" in value) return value.BOOL;
  if ("NULL" in value) return null;
  if ("M" in value) {
    return Object.fromEntries(
      Object.entries(value.M).map(([key, item]) => [key, unmarshall(item)]),
    );
  }
  if ("L" in value) return value.L.map(unmarshall);
  if ("SS" in value) return value.SS;
  if ("NS" in value) return value.NS.map(Number);
  if ("BS" in value) return value.BS;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unmarshall(item)]));
}

function scanDynamoTable(tableName) {
  debugLog(`  ↳ Full-Scan ${tableName} (manuelle Owner/Admin-Operation)`);
  const items = [];
  let exclusiveStartKey = null;

  while (true) {
    const args = ["dynamodb", "scan", "--table-name", tableName];
    if (exclusiveStartKey) {
      args.push("--exclusive-start-key", JSON.stringify(exclusiveStartKey));
    }

    const response = runAws(args);
    if (Array.isArray(response.Items)) {
      items.push(...response.Items.map(unmarshall));
    }

    if (!response.LastEvaluatedKey) break;
    exclusiveStartKey = response.LastEvaluatedKey;
  }

  return items;
}

function fetchCognitoUsers(userPoolId) {
  const users = [];
  let paginationToken = null;

  while (true) {
    const args = ["cognito-idp", "list-users", "--user-pool-id", userPoolId];
    if (paginationToken) args.push("--pagination-token", paginationToken);
    const response = runAws(args);

    for (const user of response.Users || []) {
      const attributes = Object.fromEntries(
        (user.Attributes || []).map((attribute) => [attribute.Name, attribute.Value]),
      );
      users.push({
        username: user.Username,
        userId: attributes.sub || user.Username,
        email: attributes.email || null,
        emailVerified: attributes.email_verified === "true",
        userStatus: user.UserStatus,
        enabled: Boolean(user.Enabled),
        createdAt: user.UserCreateDate ? new Date(user.UserCreateDate).toISOString() : null,
        lastModifiedAt: user.UserLastModifiedDate
          ? new Date(user.UserLastModifiedDate).toISOString()
          : null,
      });
    }

    if (!response.PaginationToken) break;
    paginationToken = response.PaginationToken;
  }

  return users;
}

function fetchUserPoolClientIds(userPoolId) {
  try {
    const response = runAws([
      "cognito-idp",
      "list-user-pool-clients",
      "--user-pool-id",
      userPoolId,
    ]);
    return (response.UserPoolClients || []).map((client) => client.ClientId).filter(Boolean);
  } catch (error) {
    debugLog(`Konnte User-Pool-Clients nicht auflösen: ${error.message}`);
    return [];
  }
}

function fetchCloudTrailLogins(clientIds, knownSubs) {
  const logins = [];
  const clientSet = new Set(clientIds.filter(Boolean));
  const subSet = new Set(knownSubs.filter(Boolean));
  let completeWithinLookupWindow = true;
  let errorMessage = null;

  debugLog(
    `Ermittle Login-Evidence aus CloudTrail lookup-events (max. ${CLOUDTRAIL_EVENT_HISTORY_DAYS} Tage Event-History)...`,
  );

  try {
    let nextToken = null;
    while (true) {
      const args = [
        "cloudtrail",
        "lookup-events",
        "--lookup-attributes",
        "AttributeKey=EventName,AttributeValue=RespondToAuthChallenge",
        "--max-results",
        "50",
      ];
      if (nextToken) args.push("--next-token", nextToken);

      const response = runAws(args);
      for (const event of response.Events || []) {
        if (!event.CloudTrailEvent) continue;
        try {
          const cloudTrailEvent = JSON.parse(event.CloudTrailEvent);
          const requestClientId = cloudTrailEvent.requestParameters?.clientId;
          const sub = cloudTrailEvent.additionalEventData?.sub;
          const matchesKnownIdentity =
            (requestClientId && clientSet.has(requestClientId)) || (sub && subSet.has(sub));
          const successful = Boolean(
            cloudTrailEvent.responseElements?.authenticationResult?.accessToken,
          );

          if (matchesKnownIdentity && successful && sub) {
            logins.push({
              sub,
              timestamp: event.EventTime ? new Date(event.EventTime).toISOString() : null,
              ip: cloudTrailEvent.sourceIPAddress || null,
              userAgent: cloudTrailEvent.userAgent || null,
              authFlow: cloudTrailEvent.requestParameters?.challengeName || "PASSWORD_VERIFIER",
            });
          }
        } catch {
          // Einzelne unparsebare Events ändern nicht die übrige best-effort Evidence.
        }
      }

      if (!response.NextToken) break;
      nextToken = response.NextToken;
    }
  } catch (error) {
    completeWithinLookupWindow = false;
    errorMessage = error.message;
    debugLog(`CloudTrail-Abfrage unvollständig: ${error.message}`);
  }

  logins.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
  return { logins, completeWithinLookupWindow, errorMessage };
}

function loadScenarioCatalog() {
  const scenariosDir = join(repoRoot, "content", "scenarios");
  const scenarios = new Map();
  if (!existsSync(scenariosDir)) return scenarios;

  for (const file of readdirSync(scenariosDir).filter((name) => name.endsWith(".json"))) {
    try {
      const content = JSON.parse(readFileSync(join(scenariosDir, file), "utf8"));
      if (content?.id) {
        scenarios.set(content.id, {
          id: content.id,
          title: content.title || content.id,
          mode: content.mode || null,
          moduleId: content.moduleId || null,
        });
      }
    } catch {
      // Defekte Content-Dateien gehören nicht in den Operational-Export.
    }
  }
  return scenarios;
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return null;
  const [localPart, domain, ...rest] = email.split("@");
  if (!domain || rest.length > 0) return email;
  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] || "*"}***`
      : `${localPart[0]}***${localPart[localPart.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

function displayEmail(email) {
  return maskEmails ? maskEmail(email) : email;
}

function parseDateToIso(value) {
  if (!value) return null;
  if (typeof value === "number") {
    return new Date(value < 1e11 ? value * 1000 : value).toISOString();
  }
  if (typeof value !== "string") return null;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return new Date(numeric < 1e11 ? numeric * 1000 : numeric).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatGermanDateTime(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function padCell(value, length, align = "left") {
  const text = String(value ?? "");
  if (text.length >= length) return text.slice(0, length);
  const spaces = " ".repeat(length - text.length);
  return align === "right" ? spaces + text : text + spaces;
}

function renderTable(headers, rows, alignments = []) {
  const widths = headers.map((header, index) => {
    return Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length));
  });
  const border = (left, middle, right) =>
    left + widths.map((width) => "─".repeat(width + 2)).join(middle) + right;
  const row = (cells) =>
    `│ ${cells
      .map((cell, index) => padCell(cell, widths[index], alignments[index] || "left"))
      .join(" │ ")} │`;

  return [
    border("┌", "┬", "┐"),
    row(headers),
    border("├", "┼", "┤"),
    ...rows.map(row),
    border("└", "┴", "┘"),
  ].join("\n");
}

function groupByUser(items) {
  const map = new Map();
  for (const item of items) {
    if (!item.userId) continue;
    if (!map.has(item.userId)) map.set(item.userId, []);
    map.get(item.userId).push(item);
  }
  return map;
}

function aggregateCohort({ users, sessions, runs, scoreEvents, attestations, loginsMap, catalog }) {
  const sessionsByUser = groupByUser(sessions);
  const runsByUser = groupByUser(runs);
  const scoresByUser = groupByUser(scoreEvents);
  const attestationsByUser = groupByUser(attestations);
  const usersDirectory = [];
  const scenarioStats = new Map();
  let activeUsers = 0;
  let totalPoints = 0;

  for (const score of scoreEvents) {
    if (typeof score.pointsDelta === "number") totalPoints += score.pointsDelta;
  }

  function scenarioEntry(scenarioId) {
    if (!scenarioStats.has(scenarioId)) {
      const metadata = catalog.get(scenarioId);
      scenarioStats.set(scenarioId, {
        scenarioId,
        title: metadata?.title || scenarioId,
        moduleId: metadata?.moduleId || null,
        totalSessions: 0,
        totalRuns: 0,
        totalPointsAwarded: 0,
        uniqueUsers: new Set(),
      });
    }
    return scenarioStats.get(scenarioId);
  }

  for (const session of sessions) {
    if (!session.scenarioId) continue;
    const entry = scenarioEntry(session.scenarioId);
    entry.totalSessions += 1;
    if (session.userId) entry.uniqueUsers.add(session.userId);
  }
  for (const run of runs) {
    if (!run.scenarioId) continue;
    const entry = scenarioEntry(run.scenarioId);
    entry.totalRuns += 1;
    if (run.userId) entry.uniqueUsers.add(run.userId);
  }
  for (const score of scoreEvents) {
    if (!score.scenarioId) continue;
    const entry = scenarioEntry(score.scenarioId);
    if (typeof score.pointsDelta === "number") entry.totalPointsAwarded += score.pointsDelta;
    if (score.userId) entry.uniqueUsers.add(score.userId);
  }

  for (const user of users) {
    const userSessions = sessionsByUser.get(user.userId) || [];
    const userRuns = runsByUser.get(user.userId) || [];
    const userScores = scoresByUser.get(user.userId) || [];
    const userAttestations = attestationsByUser.get(user.userId) || [];
    const userLogins = loginsMap.get(user.userId) || [];
    const interactionCount =
      userSessions.length +
      userRuns.length +
      userScores.length +
      userAttestations.length +
      userLogins.length;
    if (interactionCount > 0) activeUsers += 1;

    const timestamps = [
      user.createdAt,
      user.lastModifiedAt,
      ...userSessions.map((item) => parseDateToIso(item.stateUpdatedAt)),
      ...userRuns.map((item) => parseDateToIso(item.finishedAt || item.startedAt)),
      ...userScores.map((item) => parseDateToIso(item.occurredAt)),
      ...userLogins.map((item) => item.timestamp),
    ].filter(Boolean);

    usersDirectory.push({
      userId: user.userId,
      email: displayEmail(user.email),
      status: user.userStatus,
      enabled: user.enabled,
      createdAt: user.createdAt,
      lastModifiedAt: user.lastModifiedAt,
      engagement: {
        isActive: interactionCount > 0,
        sessionsCount: userSessions.length,
        runsCount: userRuns.length,
        scoreEventsCount: userScores.length,
        attestationsCount: userAttestations.length,
        loginCount: userLogins.length,
        lastActiveAt: timestamps.length ? timestamps.sort().at(-1) : null,
      },
    });
  }

  return {
    summary: {
      totalUsers: users.length,
      activeUsers,
      activePercent: users.length ? Math.round((activeUsers / users.length) * 100) : 0,
      totalSessions: sessions.length,
      totalRuns: runs.length,
      totalScoreEvents: scoreEvents.length,
      totalPoints,
      totalAttestations: attestations.length,
    },
    usersDirectory,
    byScenario: Array.from(scenarioStats.values())
      .map((entry) => ({
        ...entry,
        uniqueUsers: undefined,
        uniqueUsersCount: entry.uniqueUsers.size,
      }))
      .sort((a, b) => b.totalRuns + b.totalSessions - (a.totalRuns + a.totalSessions)),
  };
}

function discoverResources(appId, explicitApiId, explicitUserPoolId) {
  let apiId = explicitApiId;
  let userPoolId = explicitUserPoolId;

  if (!apiId || !userPoolId) {
    const apiResponse = runAws(["appsync", "list-graphql-apis"]);
    const matchedApi = apiResponse.graphqlApis?.find(
      (api) => api.tags?.["amplify:app-id"] === appId,
    );
    if (matchedApi) {
      apiId ||= matchedApi.apiId;
      userPoolId ||= matchedApi.userPoolConfig?.userPoolId;
    }
  }

  if (!userPoolId) {
    const pools = runAws(["cognito-idp", "list-user-pools", "--max-results", "20"]);
    userPoolId = pools.UserPools?.find((pool) =>
      pool.Name?.toLowerCase().includes("amplifyauth"),
    )?.Id;
  }

  if (!userPoolId) {
    throw new Error("Cognito User Pool konnte nicht ermittelt werden. --user-pool-id angeben.");
  }

  const tablesResponse = runAws(["dynamodb", "list-tables"]);
  const allTables = tablesResponse.TableNames || [];
  const suffix = apiId ? `-${apiId}-NONE` : null;
  const findTable = (prefix) => {
    if (suffix && allTables.includes(`${prefix}${suffix}`)) return `${prefix}${suffix}`;
    return allTables.find((name) => name.startsWith(`${prefix}-`)) || null;
  };

  return {
    apiId,
    userPoolId,
    tables: {
      trainingSession: findTable("TrainingSession"),
      scenarioRun: findTable("ScenarioRun"),
      scoreEvent: findTable("ScoreEvent"),
      userProfile: findTable("UserProfile"),
      userPreferences: findTable("UserPreferences"),
      attestation: findTable("Attestation"),
      runtimeSnapshot: findTable("RuntimeSnapshot"),
      telemetryEvent: findTable("TrainingTelemetryEvent"),
    },
  };
}

function splitCohorts(users, profiles, preferences) {
  const profileByUserId = new Map(
    profiles.filter((item) => item.userId).map((item) => [item.userId, item]),
  );
  const preferenceByUserId = new Map(
    preferences.filter((item) => item.userId).map((item) => [item.userId, item]),
  );
  const testUsers = [];
  const customerUsers = [];

  for (const user of users) {
    const tenantId =
      profileByUserId.get(user.userId)?.tenantId ||
      preferenceByUserId.get(user.userId)?.tenantId ||
      null;
    (isTestAccount(user.email, tenantId) ? testUsers : customerUsers).push(user);
  }

  return { testUsers, customerUsers };
}

function onlyForUserIds(items, userIds, includeUnowned = false) {
  return items.filter((item) => {
    if (item.userId && userIds.has(item.userId)) return true;
    return includeUnowned && (!item.userId || !userIds.has(item.userId));
  });
}

function printSourceLimitNotice() {
  console.log("\nDATENQUELLEN-GRENZEN:");
  console.log(`  DynamoDB: ${DYNAMODB_SCAN_NOTICE}`);
  console.log(`  CloudTrail: ${CLOUDTRAIL_NOTICE}`);
}

async function main() {
  checkAwsCli();

  let appId = values["app-id"] || process.env.AMPLIFY_APP_ID;
  if (!appId) {
    debugLog("Ermittle Amplify App...");
    const apps = runAws(["amplify", "list-apps"]).apps || [];
    const candidate = apps.find(
      (app) => app.name === "ai-tutor-lab" || app.repository?.endsWith("/ai-tutor-lab"),
    );
    if (!candidate) {
      throw new Error("Keine Amplify App für ai-tutor-lab gefunden. --app-id angeben.");
    }
    appId = candidate.appId;
  }

  const resources = discoverResources(
    appId,
    values["api-id"],
    values["user-pool-id"] || process.env.COGNITO_USER_POOL_ID,
  );
  const { apiId, userPoolId, tables } = resources;

  debugLog(`✓ Amplify App ID: ${appId}`);
  debugLog(`✓ AppSync API ID: ${apiId || "(nicht ermittelt)"}`);
  debugLog(`✓ Cognito User Pool ID: ${userPoolId}`);
  debugLog("Gefundene DynamoDB-Tabellen:");
  for (const [key, tableName] of Object.entries(tables)) {
    if (tableName) debugLog(`  - ${key}: ${tableName}`);
  }

  const rawUsers = fetchCognitoUsers(userPoolId);
  const cloudTrail = fetchCloudTrailLogins(
    fetchUserPoolClientIds(userPoolId),
    rawUsers.map((user) => user.userId),
  );
  const rawLogins = cloudTrail.logins;
  const loginsByUserId = new Map();
  for (const login of rawLogins) {
    if (!loginsByUserId.has(login.sub)) loginsByUserId.set(login.sub, []);
    loginsByUserId.get(login.sub).push(login);
  }

  const readTable = (tableName) => (tableName ? scanDynamoTable(tableName) : []);
  const rawProfiles = readTable(tables.userProfile);
  const rawPreferences = readTable(tables.userPreferences);
  const rawSessions = readTable(tables.trainingSession);
  const rawRuns = readTable(tables.scenarioRun);
  const rawScoreEvents = readTable(tables.scoreEvent);
  const rawAttestations = readTable(tables.attestation);
  const rawSnapshots = readTable(tables.runtimeSnapshot);
  const rawTelemetry = readTable(tables.telemetryEvent);

  const { customerUsers, testUsers } = splitCohorts(rawUsers, rawProfiles, rawPreferences);
  const customerIds = new Set(customerUsers.map((user) => user.userId));
  const testIds = new Set(testUsers.map((user) => user.userId));
  const catalog = loadScenarioCatalog();

  const customersReport = aggregateCohort({
    users: customerUsers,
    sessions: onlyForUserIds(rawSessions, customerIds),
    runs: onlyForUserIds(rawRuns, customerIds),
    scoreEvents: onlyForUserIds(rawScoreEvents, customerIds),
    attestations: onlyForUserIds(rawAttestations, customerIds),
    loginsMap: loginsByUserId,
    catalog,
  });
  const testsReport = aggregateCohort({
    users: testUsers,
    sessions: onlyForUserIds(rawSessions, testIds, true),
    runs: onlyForUserIds(rawRuns, testIds, true),
    scoreEvents: onlyForUserIds(rawScoreEvents, testIds, true),
    attestations: onlyForUserIds(rawAttestations, testIds, true),
    loginsMap: loginsByUserId,
    catalog,
  });
  const combinedReport = aggregateCohort({
    users: rawUsers,
    sessions: rawSessions,
    runs: rawRuns,
    scoreEvents: rawScoreEvents,
    attestations: rawAttestations,
    loginsMap: loginsByUserId,
    catalog,
  });

  const chronologicalUsers = [...rawUsers].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || ""),
  );
  const registrations = chronologicalUsers.map((user, index) => ({
    index: index + 1,
    registeredAt: user.createdAt,
    userId: user.userId,
    email: displayEmail(user.email),
    category: testIds.has(user.userId) ? "test" : "customer",
    status: user.userStatus,
    loginCount: (loginsByUserId.get(user.userId) || []).length,
  }));

  const logins = rawLogins.map((login) => {
    const user = rawUsers.find((candidate) => candidate.userId === login.sub);
    return {
      timestamp: login.timestamp,
      userId: login.sub,
      email: displayEmail(user?.email) || login.sub,
      category: testIds.has(login.sub) ? "test" : "customer",
      ip: login.ip,
      userAgent: login.userAgent,
      authFlow: login.authFlow,
    };
  });

  const monitoringData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      generator: "scripts/extract-platform-monitoring.mjs",
      reportType: "owner-admin-beta-monitoring",
      executionMode: "manual-owner-admin-only",
      filterCriteria: {
        configuredExactTestEmailsCount: customTestEmails.size,
        configuredExactTestEmailsSource: "--test-emails / PLATFORM_MONITORING_TEST_EMAILS",
        testPatterns: [
          "@example.com",
          "+cloud-acceptance@",
          "deletable_*",
          "tenant:cloud-acceptance*",
        ],
      },
      dataSourceLimits: {
        dynamoDb: {
          method: "Scan",
          fullTableScan: true,
          automaticSchedulingAllowed: false,
          productRequestPathAllowed: false,
          notice: DYNAMODB_SCAN_NOTICE,
        },
        cloudTrail: {
          method: "lookup-events",
          eventHistoryWindowDaysTypical: CLOUDTRAIL_EVENT_HISTORY_DAYS,
          rateLimited: true,
          completeWithinLookupWindow: cloudTrail.completeWithinLookupWindow,
          queryError: cloudTrail.errorMessage,
          notice: CLOUDTRAIL_NOTICE,
        },
      },
      privacy: {
        emailsMasked: maskEmails,
        exportIsLocal: true,
        generatedFileMustNotBeCommitted: true,
      },
      aws: {
        region,
        amplifyAppId: appId,
        branch: targetBranch,
        cognitoUserPoolId: userPoolId,
        appSyncApiId: apiId,
      },
      tablesDiscovered: tables,
    },
    summary: {
      customers: customersReport.summary,
      internalTests: testsReport.summary,
      combined: combinedReport.summary,
    },
    timelines: {
      registrations,
      logins,
    },
    customers: customersReport,
    internalTests: testsReport,
    combined: combinedReport,
    rawCollections: {
      trainingSessions: rawSessions,
      scenarioRuns: rawRuns,
      attestations: rawAttestations,
      runtimeSnapshots: rawSnapshots,
      userProfiles: rawProfiles,
      userPreferences: rawPreferences,
      telemetryEvents: rawTelemetry,
    },
  };

  writeFileSync(outputPath, `${JSON.stringify(monitoringData, null, 2)}\n`, "utf8");

  const usersForView =
    viewMode === "customers"
      ? customerUsers
      : viewMode === "tests"
        ? testUsers
        : chronologicalUsers;

  if (values["list-emails"]) {
    for (const user of usersForView) {
      const email = displayEmail(user.email);
      if (email) console.log(email);
    }
    return;
  }

  if (quiet) return;

  console.log("");
  console.log(
    "====================================================================================================",
  );
  console.log(" AI TUTOR LAB — PLATTFORM- & NUTZER-MONITORING");
  console.log(
    ` Stand: ${formatGermanDateTime(monitoringData.metadata.generatedAt)} | Region: ${region} | Branch: ${targetBranch}`,
  );
  console.log(
    "====================================================================================================",
  );
  printSourceLimitNotice();

  const customerSummary = customersReport.summary;
  const testSummary = testsReport.summary;
  const allSummary = combinedReport.summary;

  if (viewMode === "all") {
    console.log("\nÜBERSICHT (KUNDEN vs. INTERNE TESTS):");
    console.log(
      renderTable(
        ["Kennzahl", "Kunden", "Tests", "Gesamt"],
        [
          [
            "Registrierte Benutzer",
            customerSummary.totalUsers,
            testSummary.totalUsers,
            allSummary.totalUsers,
          ],
          [
            "Aktive Benutzer",
            customerSummary.activeUsers,
            testSummary.activeUsers,
            allSummary.activeUsers,
          ],
          [
            "Trainings-Sessions",
            customerSummary.totalSessions,
            testSummary.totalSessions,
            allSummary.totalSessions,
          ],
          ["Scenario-Runs", customerSummary.totalRuns, testSummary.totalRuns, allSummary.totalRuns],
          [
            "Score-Events",
            customerSummary.totalScoreEvents,
            testSummary.totalScoreEvents,
            allSummary.totalScoreEvents,
          ],
          ["Punkte", customerSummary.totalPoints, testSummary.totalPoints, allSummary.totalPoints],
          [
            "Attestations",
            customerSummary.totalAttestations,
            testSummary.totalAttestations,
            allSummary.totalAttestations,
          ],
        ],
        ["left", "right", "right", "right"],
      ),
    );
  } else {
    const selected = viewMode === "customers" ? customerSummary : testSummary;
    console.log(`\n${viewMode === "customers" ? "KUNDEN" : "TEST"}-ÜBERSICHT:`);
    console.log(
      renderTable(
        ["Kennzahl", "Wert"],
        [
          ["Registrierte Benutzer", selected.totalUsers],
          ["Aktive Benutzer", selected.activeUsers],
          ["Trainings-Sessions", selected.totalSessions],
          ["Scenario-Runs", selected.totalRuns],
          ["Score-Events", selected.totalScoreEvents],
          ["Punkte", selected.totalPoints],
          ["Attestations", selected.totalAttestations],
        ],
        ["left", "right"],
      ),
    );
  }

  const filteredRegistrations = registrations.filter((registration) => {
    if (viewMode === "customers" && registration.category !== "customer") return false;
    if (viewMode === "tests" && registration.category !== "test") return false;
    if (!filterUser) return true;
    return (
      registration.userId === filterUser || registration.email?.toLowerCase().includes(filterUser)
    );
  });

  console.log("\nREGISTRIERUNGSVERLAUF:");
  if (!filteredRegistrations.length) {
    console.log("  (Keine passenden Registrierungen)");
  } else {
    console.log(
      renderTable(
        ["#", "Zeitpunkt", "E-Mail", "Typ", "Status", "Logins"],
        filteredRegistrations.map((registration) => [
          registration.index,
          formatGermanDateTime(registration.registeredAt),
          registration.email || "-",
          registration.category,
          registration.status || "-",
          registration.loginCount,
        ]),
        ["right", "left", "left", "left", "left", "right"],
      ),
    );
  }

  if (showLogins) {
    console.log(
      `\nLOGIN-EVIDENCE AUS CLOUDTRAIL (best effort, typischerweise max. ${CLOUDTRAIL_EVENT_HISTORY_DAYS} Tage):`,
    );
    const filteredLogins = logins.filter((login) => {
      if (viewMode === "customers" && login.category !== "customer") return false;
      if (viewMode === "tests" && login.category !== "test") return false;
      if (!filterUser) return true;
      return login.userId === filterUser || login.email?.toLowerCase().includes(filterUser);
    });
    if (!filteredLogins.length) {
      console.log(
        "  (Keine passenden CloudTrail-Login-Events gefunden; das beweist keine historische Abwesenheit.)",
      );
    } else {
      console.log(
        renderTable(
          ["Zeitpunkt", "E-Mail", "Typ", "IP", "Auth"],
          filteredLogins.map((login) => [
            formatGermanDateTime(login.timestamp),
            login.email || "-",
            login.category,
            login.ip || "-",
            login.authFlow || "-",
          ]),
        ),
      );
    }
  }

  if (!showTimeline && !showLogins) {
    const scenarios = [
      ...(viewMode === "tests"
        ? []
        : customersReport.byScenario.map((item) => ({ ...item, cohort: "Kunde" }))),
      ...(viewMode === "customers"
        ? []
        : testsReport.byScenario.map((item) => ({ ...item, cohort: "Test" }))),
    ]
      .sort((a, b) => b.totalRuns + b.totalSessions - (a.totalRuns + a.totalSessions))
      .slice(0, 8);
    if (scenarios.length) {
      console.log("\nTOP-SZENARIEN:");
      console.log(
        renderTable(
          ["Szenario", "Kohorte", "Runs", "Sessions", "Nutzer", "Punkte"],
          scenarios.map((scenario) => [
            scenario.scenarioId,
            scenario.cohort,
            scenario.totalRuns,
            scenario.totalSessions,
            scenario.uniqueUsersCount,
            scenario.totalPointsAwarded,
          ]),
          ["left", "left", "right", "right", "right", "right"],
        ),
      );
    }
  }

  const fileSizeKb = Math.round(statSync(outputPath).size / 1024);
  console.log(
    "\n----------------------------------------------------------------------------------------------------",
  );
  console.log(`✓ JSON-Export bereitgestellt: ${outputPath} (${fileSizeKb} KB)`);
  if (!customerUsers.length) {
    console.log(
      "ℹ In dieser Abfrage wurden keine Produktiv-Kunden erkannt; Testkonten werden weiterhin separat ausgewiesen.",
    );
  }
  console.log(
    "----------------------------------------------------------------------------------------------------\n",
  );
}

main().catch((error) => {
  logError("\nFEHLER bei der Extraktion der Plattform-Daten:");
  logError(error.message || error);
  process.exit(1);
});
