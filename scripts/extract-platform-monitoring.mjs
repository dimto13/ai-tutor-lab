#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

// Bekannte Baseline-Test-E-Mails aus Entwicklungs- und E2E-Akzeptanztests
const DEFAULT_TEST_EMAILS = new Set([
  "deletable_next19@online.de",
  "info_com17+cloud-acceptance@online.de",
  "ai-tutor-cloud-a@example.com",
  "ai-tutor-cloud-peer@example.com",
  "ai-tutor-cloud-b@example.com",
  "ai-tutor-cloud-personal@example.com",
  "deletable_next21@online.de",
]);

const options = {
  output: { type: "string", short: "o", default: "platform-monitoring.json" },
  region: { type: "string", short: "r" },
  profile: { type: "string", short: "p" },
  "app-id": { type: "string", short: "a" },
  branch: { type: "string", short: "b" },
  "user-pool-id": { type: "string", short: "u" },
  "api-id": { type: "string" },
  view: { type: "string", default: "all" }, // 'all', 'customers', 'tests'
  "test-emails": { type: "string" }, // zusätzliche kommagetrennte Test-E-Mails
  verbose: { type: "boolean", short: "v", default: false },
  quiet: { type: "boolean", short: "q", default: false },
  "mask-emails": { type: "boolean", default: false },
  "list-emails": { type: "boolean", default: false },
  logins: { type: "boolean", short: "l", default: false }, // alle einzelnen Anmeldezeitpunkte auflisten
  timeline: { type: "boolean", short: "t", default: false }, // Fokus auf Registrierungs-Verlauf
  user: { type: "string" }, // Filter für einzelnen Benutzer (E-Mail oder User-ID)
  help: { type: "boolean", short: "h", default: false },
};

function printHelp() {
  console.log(`
Plattform- & Interaktions-Monitoring Dashboard

Trennt automatisch zwischen echten Kunden-Nutzern und internen Test-/Entwicklungs-Accounts.
Enthält einen zeitlichen Verlauf aller Registrierungen sowie die einzelnen Anmeldezeitpunkte je Benutzer.

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
      --view <bereich>       Filter für die Anzeige: 'all' (Standard), 'customers' oder 'tests'
      --test-emails <liste>  Zusätzliche kommagetrennte Test-E-Mail-Adressen
      --mask-emails          E-Mail-Adressen in der Ausgabe maskieren (Datenschutz)
      --list-emails          Nur die Liste der registrierten E-Mails ausgeben
  -l, --logins               Alle einzelnen Anmeldezeitpunkte je Benutzer detailliert auflisten
  -t, --timeline             Fokus auf den chronologischen Verlauf der Registrierungen
      --user <email|id>      Filter auf einen bestimmten Benutzer
  -v, --verbose              Erweiterte Lade- und Discovery-Details anzeigen
  -q, --quiet                Keine Konsolenausgabe, nur JSON schreiben
  -h, --help                 Diese Hilfe anzeigen
`);
}

let parsedArgs;
try {
  parsedArgs = parseArgs({ options, allowPositionals: false });
} catch (err) {
  console.error(`Fehler beim Parsen der Argumente: ${err.message}`);
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
const quiet = values.quiet;
const verbose = values.verbose;
const maskEmails = values["mask-emails"];
const viewMode = (values.view || "all").toLowerCase();
const showLogins = Boolean(values.logins);
const showTimeline = Boolean(values.timeline);
const filterUser = values.user ? values.user.trim().toLowerCase() : null;

const customTestEmails = new Set();
if (values["test-emails"]) {
  for (const email of values["test-emails"].split(",")) {
    const trimmed = email.trim().toLowerCase();
    if (trimmed) customTestEmails.add(trimmed);
  }
}

function isTestAccount(email, tenantId) {
  const normEmail = (email || "").trim().toLowerCase();
  if (DEFAULT_TEST_EMAILS.has(normEmail)) return true;
  if (customTestEmails.has(normEmail)) return true;
  if (normEmail.endsWith("@example.com")) return true;
  if (normEmail.includes("+cloud-acceptance@")) return true;
  if (normEmail.startsWith("deletable_")) return true;
  if (tenantId && String(tenantId).startsWith("cloud-acceptance")) return true;
  return false;
}

function debugLog(...msg) {
  if (verbose && !quiet) console.log(...msg);
}

function logError(...msg) {
  console.error(...msg);
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
    logError("Bitte die AWS CLI installieren und konfigurieren.");
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

function unmarshall(item) {
  if (!item || typeof item !== "object") return item;
  if ("S" in item) return item.S;
  if ("N" in item) return Number(item.N);
  if ("B" in item) return item.B;
  if ("BOOL" in item) return item.BOOL;
  if ("NULL" in item) return null;
  if ("M" in item) {
    const res = {};
    for (const [k, v] of Object.entries(item.M)) {
      res[k] = unmarshall(v);
    }
    return res;
  }
  if ("L" in item) return item.L.map(unmarshall);
  if ("SS" in item) return item.SS;
  if ("NS" in item) return item.NS.map(Number);
  if ("BS" in item) return item.BS;
  const res = {};
  for (const [k, v] of Object.entries(item)) {
    res[k] = unmarshall(v);
  }
  return res;
}

function scanDynamoTable(tableName) {
  const items = [];
  let exclusiveStartKey = null;

  while (true) {
    const args = ["dynamodb", "scan", "--table-name", tableName];
    if (exclusiveStartKey) {
      args.push("--exclusive-start-key", JSON.stringify(exclusiveStartKey));
    }

    const response = runAws(args);
    if (response.Items && Array.isArray(response.Items)) {
      items.push(...response.Items.map(unmarshall));
    }

    if (response.LastEvaluatedKey) {
      exclusiveStartKey = response.LastEvaluatedKey;
    } else {
      break;
    }
  }

  return items;
}

function fetchCognitoUsers(userPoolId) {
  const users = [];
  let paginationToken = null;

  while (true) {
    const args = ["cognito-idp", "list-users", "--user-pool-id", userPoolId];
    if (paginationToken) {
      args.push("--pagination-token", paginationToken);
    }

    const response = runAws(args);
    if (response.Users && Array.isArray(response.Users)) {
      for (const u of response.Users) {
        const attributes = {};
        if (Array.isArray(u.Attributes)) {
          for (const attr of u.Attributes) {
            attributes[attr.Name] = attr.Value;
          }
        }
        users.push({
          username: u.Username,
          userId: attributes.sub || u.Username,
          email: attributes.email || null,
          emailVerified: attributes.email_verified === "true",
          userStatus: u.UserStatus,
          enabled: Boolean(u.Enabled),
          createdAt: u.UserCreateDate ? new Date(u.UserCreateDate).toISOString() : null,
          lastModifiedAt: u.UserLastModifiedDate
            ? new Date(u.UserLastModifiedDate).toISOString()
            : null,
          attributes,
        });
      }
    }

    if (response.PaginationToken) {
      paginationToken = response.PaginationToken;
    } else {
      break;
    }
  }

  return users;
}

function fetchUserPoolClientIds(userPoolId) {
  try {
    const res = runAws(["cognito-idp", "list-user-pool-clients", "--user-pool-id", userPoolId]);
    return (res.UserPoolClients || []).map((c) => c.ClientId);
  } catch (err) {
    debugLog(`Konnte User-Pool-Clients nicht auflösen: ${err.message}`);
    return [];
  }
}

function fetchCloudTrailLogins(clientIds, knownSubs) {
  const logins = [];
  const clientSet = new Set(clientIds.filter(Boolean));
  const subSet = new Set(knownSubs.filter(Boolean));

  debugLog("Ermittle Anmeldezeitpunkte aus AWS CloudTrail...");
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

      const res = runAws(args);
      if (res.Events && Array.isArray(res.Events)) {
        for (const ev of res.Events) {
          if (!ev.CloudTrailEvent) continue;
          try {
            const cte = JSON.parse(ev.CloudTrailEvent);
            const reqClientId = cte.requestParameters?.clientId;
            const sub = cte.additionalEventData?.sub;
            const isMatch = (reqClientId && clientSet.has(reqClientId)) || (sub && subSet.has(sub));
            const isSuccess = Boolean(cte.responseElements?.authenticationResult?.accessToken);

            if (isMatch && isSuccess && sub) {
              logins.push({
                sub,
                timestamp: ev.EventTime ? new Date(ev.EventTime).toISOString() : null,
                ip: cte.sourceIPAddress || null,
                userAgent: cte.userAgent || null,
                authFlow: cte.requestParameters?.challengeName || "PASSWORD_VERIFIER",
              });
            }
          } catch {
            // Ignoriere unparsebare CloudTrail Events
          }
        }
      }

      if (res.NextToken) {
        nextToken = res.NextToken;
      } else {
        break;
      }
    }
  } catch (err) {
    debugLog(
      `Hinweis: CloudTrail-Events konnten nicht vollständig abgefragt werden (${err.message}).`,
    );
  }

  // Chronologisch aufsteigend sortieren (älteste zuerst)
  logins.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
  return logins;
}

function parseDeviceSummary(userAgent) {
  if (!userAgent || typeof userAgent !== "string") return "-";
  if (userAgent === "node" || userAgent.startsWith("aws-cli") || userAgent.startsWith("Boto3")) {
    return "API / Script";
  }
  let os = "";
  if (userAgent.includes("iPhone")) os = "iPhone";
  else if (userAgent.includes("iPad")) os = "iPad";
  else if (userAgent.includes("Macintosh")) os = "Mac";
  else if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("Linux") || userAgent.includes("X11")) os = "Linux";

  let browser = "";
  if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Chrome") || userAgent.includes("CriOS")) browser = "Chrome";
  else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";
  else if (userAgent.includes("Edge") || userAgent.includes("Edg")) browser = "Edge";

  if (os && browser) return `${os} / ${browser}`;
  if (os) return os;
  if (browser) return browser;
  return userAgent.length > 18 ? `${userAgent.slice(0, 16)}..` : userAgent;
}

function loadScenarioCatalog() {
  const scenariosDir = join(repoRoot, "content", "scenarios");
  const map = new Map();
  if (!existsSync(scenariosDir)) return map;

  const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(join(scenariosDir, file), "utf8"));
      if (content && content.id) {
        map.set(content.id, {
          id: content.id,
          title: content.title || content.id,
          mode: content.mode,
          moduleId: content.moduleId,
          points: content.points,
          estimatedMinutes: content.estimatedMinutes,
        });
      }
    } catch {
      // Ignoriere defekte JSON-Dateien
    }
  }
  return map;
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return null;
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [user, domain] = parts;
  const maskedUser = user.length <= 2 ? user[0] + "***" : user[0] + "***" + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

function parseDateToIso(val) {
  if (!val) return null;
  if (typeof val === "number") {
    const ms = val < 1e11 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  if (typeof val === "string") {
    const num = Number(val);
    if (!Number.isNaN(num) && num > 0) {
      const ms = num < 1e11 ? num * 1000 : num;
      return new Date(ms).toISOString();
    }
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function formatGermanDate(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatGermanDateTime(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

function formatGermanDateTimeSeconds(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} Uhr`;
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function padCell(str, len, align = "left") {
  const s = String(str ?? "");
  if (s.length >= len) return s.slice(0, len);
  const spaces = " ".repeat(len - s.length);
  return align === "right" ? spaces + s : s + spaces;
}

function renderTable(headers, rows, alignments = []) {
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cellLen = String(row[i] ?? "").length;
      if (cellLen > max) max = cellLen;
    }
    return max;
  });

  const topBorder = "┌" + colWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const sepBorder = "├" + colWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const botBorder = "└" + colWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  const renderRow = (cells) => {
    return (
      "│ " +
      cells
        .map((cell, idx) => {
          const align = alignments[idx] || "left";
          return padCell(cell, colWidths[idx], align);
        })
        .join(" │ ") +
      " │"
    );
  };

  const lines = [topBorder, renderRow(headers), sepBorder];
  for (const row of rows) {
    lines.push(renderRow(row));
  }
  lines.push(botBorder);
  return lines.join("\n");
}

function aggregateCohort({
  users,
  sessions,
  runs,
  scoreEvents,
  attestations,
  profilesMap,
  preferencesMap,
  loginsMap = new Map(),
  scenarioCatalog,
}) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const sortedUsers = [...users].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  const dailyGrowthMap = new Map();
  const weeklyGrowthMap = new Map();
  const monthlyGrowthMap = new Map();
  const emailDomainMap = new Map();
  const statusMap = new Map();

  let cumulativeCount = 0;
  const timelineDaily = [];

  for (const u of sortedUsers) {
    statusMap.set(u.userStatus, (statusMap.get(u.userStatus) || 0) + 1);

    const email = u.email || "";
    const domain = email.includes("@") ? email.split("@")[1].toLowerCase() : "unbekannt";
    emailDomainMap.set(domain, (emailDomainMap.get(domain) || 0) + 1);

    if (u.createdAt) {
      const dateObj = new Date(u.createdAt);
      const dayKey = u.createdAt.slice(0, 10);
      const monthKey = u.createdAt.slice(0, 7);
      const weekKey = getIsoWeek(dateObj);

      dailyGrowthMap.set(dayKey, (dailyGrowthMap.get(dayKey) || 0) + 1);
      monthlyGrowthMap.set(monthKey, (monthlyGrowthMap.get(monthKey) || 0) + 1);
      weeklyGrowthMap.set(weekKey, (weeklyGrowthMap.get(weekKey) || 0) + 1);
    }
  }

  for (const [date, count] of dailyGrowthMap.entries()) {
    cumulativeCount += count;
    timelineDaily.push({
      date,
      newUsers: count,
      cumulativeUsers: cumulativeCount,
    });
  }

  const sessionsByUser = new Map();
  for (const s of sessions) {
    if (!s.userId) continue;
    if (!sessionsByUser.has(s.userId)) sessionsByUser.set(s.userId, []);
    sessionsByUser.get(s.userId).push(s);
  }

  const runsByUser = new Map();
  for (const r of runs) {
    if (!r.userId) continue;
    if (!runsByUser.has(r.userId)) runsByUser.set(r.userId, []);
    runsByUser.get(r.userId).push(r);
  }

  const scoreEventsByUser = new Map();
  for (const sc of scoreEvents) {
    if (!sc.userId) continue;
    if (!scoreEventsByUser.has(sc.userId)) scoreEventsByUser.set(sc.userId, []);
    scoreEventsByUser.get(sc.userId).push(sc);
  }

  const attestationsByUser = new Map();
  for (const a of attestations) {
    if (!a.userId) continue;
    if (!attestationsByUser.has(a.userId)) attestationsByUser.set(a.userId, []);
    attestationsByUser.get(a.userId).push(a);
  }

  let activeUsersTotal = 0;
  let activeUsers7d = 0;
  let activeUsers30d = 0;

  const enrichedUsers = sortedUsers.map((u) => {
    const profile = profilesMap.get(u.userId) || {};
    const preferences = preferencesMap.get(u.userId) || {};
    const userSessions = sessionsByUser.get(u.userId) || [];
    const userRuns = runsByUser.get(u.userId) || [];
    const userScores = scoreEventsByUser.get(u.userId) || [];
    const userAttestations = attestationsByUser.get(u.userId) || [];

    let totalPoints = 0;
    for (const sc of userScores) {
      totalPoints += typeof sc.pointsDelta === "number" ? sc.pointsDelta : 0;
    }

    const interactionTimestamps = [];
    if (u.createdAt) interactionTimestamps.push(new Date(u.createdAt).getTime());
    if (u.lastModifiedAt) interactionTimestamps.push(new Date(u.lastModifiedAt).getTime());

    for (const s of userSessions) {
      const iso = parseDateToIso(s.stateUpdatedAt);
      if (iso) interactionTimestamps.push(new Date(iso).getTime());
    }
    for (const r of userRuns) {
      const iso = parseDateToIso(r.finishedAt || r.startedAt);
      if (iso) interactionTimestamps.push(new Date(iso).getTime());
    }
    for (const sc of userScores) {
      const iso = parseDateToIso(sc.occurredAt);
      if (iso) interactionTimestamps.push(new Date(iso).getTime());
    }

    const userLogins = (loginsMap && loginsMap.get(u.userId)) || [];
    for (const l of userLogins) {
      if (l.timestamp) interactionTimestamps.push(new Date(l.timestamp).getTime());
    }

    const hasInteractions =
      userSessions.length > 0 ||
      userRuns.length > 0 ||
      userScores.length > 0 ||
      userAttestations.length > 0 ||
      userLogins.length > 0;

    if (hasInteractions) activeUsersTotal += 1;

    const lastActiveTime =
      interactionTimestamps.length > 0 ? Math.max(...interactionTimestamps) : null;
    const firstActiveTime =
      interactionTimestamps.length > 0 ? Math.min(...interactionTimestamps) : null;

    if (lastActiveTime && now - lastActiveTime <= 7 * dayMs) activeUsers7d += 1;
    if (lastActiveTime && now - lastActiveTime <= 30 * dayMs) activeUsers30d += 1;

    const usedModes = new Set([
      ...userSessions.map((s) => s.mode).filter(Boolean),
      ...userRuns.map((r) => r.mode).filter(Boolean),
    ]);

    const usedScenarios = new Set([
      ...userSessions.map((s) => s.scenarioId).filter(Boolean),
      ...userRuns.map((r) => r.scenarioId).filter(Boolean),
    ]);

    const tenantId =
      profile.tenantId ||
      preferences.tenantId ||
      userSessions[0]?.tenantId ||
      userRuns[0]?.tenantId ||
      null;

    const isTest = isTestAccount(u.email, tenantId);

    return {
      userId: u.userId,
      username: u.username,
      email: maskEmails ? maskEmail(u.email) : u.email,
      emailDomain: u.email && u.email.includes("@") ? u.email.split("@")[1] : null,
      status: u.userStatus,
      enabled: u.enabled,
      createdAt: u.createdAt,
      lastModifiedAt: u.lastModifiedAt,
      displayName: profile.displayName || null,
      tenantId,
      isTestAccount: isTest,
      loginHistory: {
        totalLogins: userLogins.length,
        firstLoginAt: userLogins.length > 0 ? userLogins[0].timestamp : null,
        lastLoginAt: userLogins.length > 0 ? userLogins[userLogins.length - 1].timestamp : null,
        recentIps: [...new Set(userLogins.map((l) => l.ip).filter(Boolean))],
        recentDevices: [
          ...new Set(userLogins.map((l) => parseDeviceSummary(l.userAgent)).filter(Boolean)),
        ],
        logins: userLogins.map((l) => ({
          timestamp: l.timestamp,
          ip: l.ip,
          device: parseDeviceSummary(l.userAgent),
          authFlow: l.authFlow,
        })),
      },
      preferences: {
        language: preferences.language || null,
        selfAssessedAiLevel: preferences.selfAssessedAiLevel || null,
        weeklyGoalMinutes: preferences.weeklyGoalMinutes || null,
        preferredTrainingMode: preferences.preferredTrainingMode || null,
      },
      engagement: {
        isActive: hasInteractions,
        sessionsCount: userSessions.length,
        runsCount: userRuns.length,
        scoreEventsCount: userScores.length,
        totalPoints,
        attestationsCount: userAttestations.length,
        modesUsed: Array.from(usedModes),
        scenariosUsed: Array.from(usedScenarios),
        firstActiveAt: firstActiveTime ? new Date(firstActiveTime).toISOString() : null,
        lastActiveAt: lastActiveTime ? new Date(lastActiveTime).toISOString() : null,
      },
    };
  });

  const scenarioStatsMap = new Map();

  const getOrCreateScenarioStat = (scenarioId) => {
    if (!scenarioStatsMap.has(scenarioId)) {
      const meta = scenarioCatalog.get(scenarioId);
      scenarioStatsMap.set(scenarioId, {
        scenarioId,
        title: meta?.title || scenarioId,
        moduleId: meta?.moduleId || null,
        totalRuns: 0,
        totalSessions: 0,
        totalPointsAwarded: 0,
        durationsMs: [],
        uniqueUsers: new Set(),
        modes: { explore: 0, guided: 0, challenge: 0 },
        evidenceStatuses: {},
      });
    }
    return scenarioStatsMap.get(scenarioId);
  };

  for (const s of sessions) {
    if (!s.scenarioId) continue;
    const stat = getOrCreateScenarioStat(s.scenarioId);
    stat.totalSessions += 1;
    if (s.userId) stat.uniqueUsers.add(s.userId);
    if (s.mode && stat.modes[s.mode] !== undefined) {
      stat.modes[s.mode] += 1;
    }
  }

  for (const r of runs) {
    if (!r.scenarioId) continue;
    const stat = getOrCreateScenarioStat(r.scenarioId);
    stat.totalRuns += 1;
    if (r.userId) stat.uniqueUsers.add(r.userId);
    if (typeof r.durationMs === "number") stat.durationsMs.push(r.durationMs);
    if (r.mode && stat.modes[r.mode] !== undefined) {
      stat.modes[r.mode] += 1;
    }
    if (r.evidenceStatus) {
      stat.evidenceStatuses[r.evidenceStatus] = (stat.evidenceStatuses[r.evidenceStatus] || 0) + 1;
    }
  }

  for (const sc of scoreEvents) {
    if (!sc.scenarioId) continue;
    const stat = getOrCreateScenarioStat(sc.scenarioId);
    if (typeof sc.pointsDelta === "number") stat.totalPointsAwarded += sc.pointsDelta;
    if (sc.userId) stat.uniqueUsers.add(sc.userId);
  }

  const scenarioOverview = Array.from(scenarioStatsMap.values()).map((st) => {
    const avgDurationMs =
      st.durationsMs.length > 0
        ? Math.round(st.durationsMs.reduce((a, b) => a + b, 0) / st.durationsMs.length)
        : null;

    return {
      scenarioId: st.scenarioId,
      title: st.title,
      moduleId: st.moduleId,
      totalSessions: st.totalSessions,
      totalRuns: st.totalRuns,
      uniqueUsersCount: st.uniqueUsers.size,
      totalPointsAwarded: st.totalPointsAwarded,
      averageDurationSeconds: avgDurationMs ? Math.round(avgDurationMs / 1000) : null,
      modesDistribution: st.modes,
      evidenceStatusDistribution: st.evidenceStatuses,
    };
  });

  scenarioOverview.sort((a, b) => b.totalRuns + b.totalSessions - (a.totalRuns + a.totalSessions));

  const modeStats = {
    explore: { sessionsCount: 0, runsCount: 0, uniqueUsers: new Set() },
    guided: { sessionsCount: 0, runsCount: 0, uniqueUsers: new Set() },
    challenge: {
      sessionsCount: 0,
      runsCount: 0,
      totalPoints: 0,
      uniqueUsers: new Set(),
    },
  };

  for (const s of sessions) {
    if (s.mode && modeStats[s.mode]) {
      modeStats[s.mode].sessionsCount += 1;
      if (s.userId) modeStats[s.mode].uniqueUsers.add(s.userId);
    }
  }
  for (const r of runs) {
    if (r.mode && modeStats[r.mode]) {
      modeStats[r.mode].runsCount += 1;
      if (r.userId) modeStats[r.mode].uniqueUsers.add(r.userId);
    }
  }
  for (const sc of scoreEvents) {
    if (sc.mode === "challenge" && typeof sc.pointsDelta === "number") {
      modeStats.challenge.totalPoints += sc.pointsDelta;
    }
  }

  const modesBreakdown = {
    explore: {
      sessionsCount: modeStats.explore.sessionsCount,
      runsCount: modeStats.explore.runsCount,
      uniqueUsersCount: modeStats.explore.uniqueUsers.size,
    },
    guided: {
      sessionsCount: modeStats.guided.sessionsCount,
      runsCount: modeStats.guided.runsCount,
      uniqueUsersCount: modeStats.guided.uniqueUsers.size,
    },
    challenge: {
      sessionsCount: modeStats.challenge.sessionsCount,
      runsCount: modeStats.challenge.runsCount,
      totalPointsAwarded: modeStats.challenge.totalPoints,
      uniqueUsersCount: modeStats.challenge.uniqueUsers.size,
    },
  };

  const tenantStatsMap = new Map();
  for (const u of enrichedUsers) {
    const t = u.tenantId || "unassigned";
    if (!tenantStatsMap.has(t)) {
      tenantStatsMap.set(t, {
        tenantId: t,
        usersCount: 0,
        activeUsersCount: 0,
        sessionsCount: 0,
        runsCount: 0,
        totalPointsAwarded: 0,
      });
    }
    const stat = tenantStatsMap.get(t);
    stat.usersCount += 1;
    if (u.engagement.isActive) stat.activeUsersCount += 1;
    stat.sessionsCount += u.engagement.sessionsCount;
    stat.runsCount += u.engagement.runsCount;
    stat.totalPointsAwarded += u.engagement.totalPoints;
  }
  const tenantsBreakdown = Array.from(tenantStatsMap.values()).sort(
    (a, b) => b.runsCount + b.sessionsCount - (a.runsCount + a.sessionsCount),
  );

  let totalPointsAll = 0;
  let totalBasePoints = 0;
  let totalBonusPoints = 0;
  let totalPenaltyDeductions = 0;
  let totalFailedAttempts = 0;

  for (const sc of scoreEvents) {
    if (typeof sc.pointsDelta === "number") totalPointsAll += sc.pointsDelta;
    const bd = sc.metadata?.breakdown || sc.breakdown;
    if (bd && typeof bd === "object") {
      if (typeof bd.basePoints === "number") totalBasePoints += bd.basePoints;
      if (typeof bd.earnedBonusPoints === "number") totalBonusPoints += bd.earnedBonusPoints;
      else if (typeof bd.bonusPoints === "number") totalBonusPoints += bd.bonusPoints;
      if (typeof bd.bonusDeductionPoints === "number") {
        totalPenaltyDeductions += bd.bonusDeductionPoints;
      }
      if (typeof bd.failedAttempts === "number") totalFailedAttempts += bd.failedAttempts;
    }
  }

  const unifiedActivities = [];

  for (const u of sortedUsers) {
    if (u.createdAt) {
      unifiedActivities.push({
        timestamp: u.createdAt,
        type: "user_registered",
        userId: u.userId,
        description: `Benutzer registriert (${u.userStatus})`,
      });
    }

    const uLogins = (loginsMap && loginsMap.get(u.userId)) || [];
    for (const l of uLogins) {
      if (l.timestamp) {
        unifiedActivities.push({
          timestamp: l.timestamp,
          type: "user_login",
          userId: u.userId,
          ip: l.ip,
          device: parseDeviceSummary(l.userAgent),
          description: `Benutzer angemeldet (${parseDeviceSummary(l.userAgent)})`,
        });
      }
    }
  }

  for (const s of sessions) {
    const ts = parseDateToIso(s.stateUpdatedAt);
    if (ts) {
      unifiedActivities.push({
        timestamp: ts,
        type: "training_session_update",
        userId: s.userId,
        scenarioId: s.scenarioId,
        mode: s.mode,
        description: `Trainingssitzung aktualisiert (${s.mode} / ${s.scenarioId})`,
      });
    }
  }

  for (const r of runs) {
    const ts = parseDateToIso(r.finishedAt || r.startedAt);
    if (ts) {
      const durSec = typeof r.durationMs === "number" ? Math.round(r.durationMs / 1000) : null;
      unifiedActivities.push({
        timestamp: ts,
        type: "scenario_run_completed",
        userId: r.userId,
        scenarioId: r.scenarioId,
        mode: r.mode,
        durationSeconds: durSec,
        description: `Szenario-Durchlauf abgeschlossen (${r.mode} / ${r.scenarioId}, Dauer: ${durSec ?? "-"}s)`,
      });
    }
  }

  for (const sc of scoreEvents) {
    const ts = parseDateToIso(sc.occurredAt);
    if (ts) {
      unifiedActivities.push({
        timestamp: ts,
        type: "score_awarded",
        userId: sc.userId,
        scenarioId: sc.scenarioId,
        mode: sc.mode,
        points: sc.pointsDelta,
        description: `Punkte vergeben (+${sc.pointsDelta} Pkt für ${sc.scenarioId})`,
      });
    }
  }

  unifiedActivities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const allDurations = runs.map((r) => r.durationMs).filter((d) => typeof d === "number" && d > 0);
  const avgRunDurationSeconds =
    allDurations.length > 0
      ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length / 1000)
      : 0;

  return {
    summary: {
      users: {
        totalRegistered: users.length,
        totalActive: activeUsersTotal,
        totalInactive: users.length - activeUsersTotal,
        confirmed: statusMap.get("CONFIRMED") || 0,
        unconfirmed: statusMap.get("UNCONFIRMED") || 0,
        otherStatus: Array.from(statusMap.entries()).filter(
          ([k]) => k !== "CONFIRMED" && k !== "UNCONFIRMED",
        ),
        activePercent: users.length > 0 ? Math.round((activeUsersTotal / users.length) * 100) : 0,
      },
      activityKPIs: {
        totalTrainingSessions: sessions.length,
        totalScenarioRuns: runs.length,
        totalScoreEvents: scoreEvents.length,
        totalPointsAwarded: totalPointsAll,
        totalAttestationsIssued: attestations.length,
        averageRunDurationSeconds: avgRunDurationSeconds,
        averageRunsPerActiveUser:
          activeUsersTotal > 0 ? Number((runs.length / activeUsersTotal).toFixed(1)) : 0,
        activeUsersLast7Days: activeUsers7d,
        activeUsersLast30Days: activeUsers30d,
      },
    },
    growth: {
      overview: {
        totalUsers: users.length,
        registeredEmails: enrichedUsers.map((u) => u.email).filter(Boolean),
        timelineDaily,
        registrationsTimeline: sortedUsers.map((u, idx) => {
          const uLogins = (loginsMap && loginsMap.get(u.userId)) || [];
          return {
            index: idx + 1,
            registeredAt: u.createdAt,
            email: maskEmails ? maskEmail(u.email) : u.email,
            userId: u.userId,
            status: u.userStatus,
            cumulativeCount: idx + 1,
            totalLogins: uLogins.length,
            firstLoginAt: uLogins.length > 0 ? uLogins[0].timestamp : null,
            lastLoginAt: uLogins.length > 0 ? uLogins[uLogins.length - 1].timestamp : null,
          };
        }),
        byMonth: Object.fromEntries(monthlyGrowthMap),
        byWeek: Object.fromEntries(weeklyGrowthMap),
        byEmailDomain: Object.fromEntries(emailDomainMap),
      },
      usersDirectory: enrichedUsers,
    },
    interactions: {
      byScenario: scenarioOverview,
      byMode: modesBreakdown,
      byTenant: tenantsBreakdown,
      scoring: {
        totalPointsAwarded: totalPointsAll,
        totalScoreEvents: scoreEvents.length,
        basePointsSum: totalBasePoints,
        bonusPointsSum: totalBonusPoints,
        penaltyDeductionsSum: totalPenaltyDeductions,
        failedAttemptsSum: totalFailedAttempts,
        scoreEvents,
      },
      recentActivityFeed: unifiedActivities.slice(0, 50),
    },
  };
}

async function main() {
  checkAwsCli();

  // 1. Amplify App auflösen
  let appId = values["app-id"] || process.env.AMPLIFY_APP_ID;
  if (!appId) {
    debugLog("Ermittle Amplify App...");
    const appsResult = runAws(["amplify", "list-apps"]);
    const candidate = appsResult.apps?.find(
      (a) => a.name === "ai-tutor-lab" || a.repository?.endsWith("/ai-tutor-lab"),
    );
    if (!candidate) {
      throw new Error("Keine Amplify App für 'ai-tutor-lab' gefunden. Bitte mit --app-id angeben.");
    }
    appId = candidate.appId;
  }
  debugLog(`✓ Amplify App ID: ${appId}`);

  // 2. AppSync API & Cognito User Pool ermitteln
  let apiId = values["api-id"];
  let userPoolId = values["user-pool-id"] || process.env.COGNITO_USER_POOL_ID;

  if (!apiId || !userPoolId) {
    debugLog("Ermittle AppSync API und Cognito User Pool...");
    const apisResult = runAws(["appsync", "list-graphql-apis"]);
    const matchedApi = apisResult.graphqlApis?.find((api) => {
      const tags = api.tags || {};
      return tags["amplify:app-id"] === appId;
    });

    if (matchedApi) {
      if (!apiId) apiId = matchedApi.apiId;
      if (!userPoolId) userPoolId = matchedApi.userPoolConfig?.userPoolId;
    }
  }

  if (!userPoolId) {
    debugLog("Suche User Pool in Cognito...");
    const userPools = runAws(["cognito-idp", "list-user-pools", "--max-results", "20"]);
    const matchedPool = userPools.UserPools?.find((p) =>
      p.Name?.toLowerCase().includes("amplifyauth"),
    );
    if (matchedPool) userPoolId = matchedPool.Id;
  }

  debugLog(`✓ AppSync API ID: ${apiId || "(nicht ermittelt)"}`);
  debugLog(`✓ Cognito User Pool ID: ${userPoolId || "(nicht ermittelt)"}`);

  if (!userPoolId) {
    throw new Error(
      "Cognito User Pool ID konnte nicht ermittelt werden. Bitte --user-pool-id angeben.",
    );
  }

  // 3. Relevante DynamoDB-Tabellen finden
  debugLog("Ermittle DynamoDB-Tabellen...");
  const tablesResult = runAws(["dynamodb", "list-tables"]);
  const allTables = tablesResult.TableNames || [];

  const tableSuffix = apiId ? `-${apiId}-NONE` : "";
  const findTable = (prefix) => {
    if (apiId) {
      const direct = `${prefix}${tableSuffix}`;
      if (allTables.includes(direct)) return direct;
    }
    return allTables.find((t) => t.startsWith(`${prefix}-`)) || null;
  };

  const tables = {
    trainingSession: findTable("TrainingSession"),
    scenarioRun: findTable("ScenarioRun"),
    scoreEvent: findTable("ScoreEvent"),
    userProfile: findTable("UserProfile"),
    userPreferences: findTable("UserPreferences"),
    attestation: findTable("Attestation"),
    runtimeSnapshot: findTable("RuntimeSnapshot"),
    telemetryEvent: findTable("TrainingTelemetryEvent"),
    stepState: findTable("StepState"),
    hintUsage: findTable("HintUsage"),
    attempt: findTable("Attempt"),
    skillProfile: findTable("SkillProfile"),
  };

  debugLog("Gefundene Tabellen:");
  for (const [key, name] of Object.entries(tables)) {
    if (name) debugLog(`  - ${key}: ${name}`);
  }

  // 4. Daten auslesen
  debugLog("Lese Daten aus AWS...");
  const rawUsers = fetchCognitoUsers(userPoolId);
  debugLog(`  ✓ ${rawUsers.length} Benutzer aus Cognito geladen`);

  const clientIds = fetchUserPoolClientIds(userPoolId);
  const rawLogins = fetchCloudTrailLogins(
    clientIds,
    rawUsers.map((u) => u.userId),
  );
  debugLog(`  ✓ ${rawLogins.length} erfolgreiche Anmeldeereignisse aus CloudTrail geladen`);

  const loginsByUserId = new Map();
  for (const l of rawLogins) {
    if (!loginsByUserId.has(l.sub)) loginsByUserId.set(l.sub, []);
    loginsByUserId.get(l.sub).push(l);
  }

  const rawProfiles = tables.userProfile ? scanDynamoTable(tables.userProfile) : [];
  const rawPreferences = tables.userPreferences ? scanDynamoTable(tables.userPreferences) : [];
  const rawSessions = tables.trainingSession ? scanDynamoTable(tables.trainingSession) : [];
  const rawRuns = tables.scenarioRun ? scanDynamoTable(tables.scenarioRun) : [];
  const rawScoreEvents = tables.scoreEvent ? scanDynamoTable(tables.scoreEvent) : [];
  const rawAttestations = tables.attestation ? scanDynamoTable(tables.attestation) : [];
  const rawSnapshots = tables.runtimeSnapshot ? scanDynamoTable(tables.runtimeSnapshot) : [];
  const rawTelemetry = tables.telemetryEvent ? scanDynamoTable(tables.telemetryEvent) : [];

  const scenarioCatalog = loadScenarioCatalog();

  const profileByUserId = new Map();
  for (const p of rawProfiles) {
    if (p.userId) profileByUserId.set(p.userId, p);
  }

  const preferencesByUserId = new Map();
  for (const pref of rawPreferences) {
    if (pref.userId) preferencesByUserId.set(pref.userId, pref);
  }

  // 5. Partitionierung: Kunden (echte Nutzer) vs. Test-Accounts
  const testUsers = [];
  const customerUsers = [];

  for (const u of rawUsers) {
    const profile = profileByUserId.get(u.userId);
    const pref = preferencesByUserId.get(u.userId);
    const tenantId = profile?.tenantId || pref?.tenantId || null;

    if (isTestAccount(u.email, tenantId)) {
      testUsers.push(u);
    } else {
      customerUsers.push(u);
    }
  }

  const customerUserIds = new Set(customerUsers.map((u) => u.userId));
  const testUserIds = new Set(testUsers.map((u) => u.userId));

  const customerSessions = rawSessions.filter((s) => customerUserIds.has(s.userId));
  const customerRuns = rawRuns.filter((r) => customerUserIds.has(r.userId));
  const customerScores = rawScoreEvents.filter((sc) => customerUserIds.has(sc.userId));
  const customerAttestations = rawAttestations.filter((a) => customerUserIds.has(a.userId));

  const testSessions = rawSessions.filter(
    (s) => testUserIds.has(s.userId) || !customerUserIds.has(s.userId),
  );
  const testRuns = rawRuns.filter(
    (r) => testUserIds.has(r.userId) || !customerUserIds.has(r.userId),
  );
  const testScores = rawScoreEvents.filter(
    (sc) => testUserIds.has(sc.userId) || !customerUserIds.has(sc.userId),
  );
  const testAttestations = rawAttestations.filter(
    (a) => testUserIds.has(a.userId) || !customerUserIds.has(a.userId),
  );

  // 6. Aggregationen für beide Gruppen und Gesamt
  const customersReport = aggregateCohort({
    users: customerUsers,
    sessions: customerSessions,
    runs: customerRuns,
    scoreEvents: customerScores,
    attestations: customerAttestations,
    profilesMap: profileByUserId,
    preferencesMap: preferencesByUserId,
    loginsMap: loginsByUserId,
    scenarioCatalog,
  });

  const internalTestsReport = aggregateCohort({
    users: testUsers,
    sessions: testSessions,
    runs: testRuns,
    scoreEvents: testScores,
    attestations: testAttestations,
    profilesMap: profileByUserId,
    preferencesMap: preferencesByUserId,
    loginsMap: loginsByUserId,
    scenarioCatalog,
  });

  const combinedReport = aggregateCohort({
    users: rawUsers,
    sessions: rawSessions,
    runs: rawRuns,
    scoreEvents: rawScoreEvents,
    attestations: rawAttestations,
    profilesMap: profileByUserId,
    preferencesMap: preferencesByUserId,
    loginsMap: loginsByUserId,
    scenarioCatalog,
  });

  // 7. Chronologischer Registrierungs-Verlauf und Login-Historie
  const allChronologicalUsers = [...rawUsers].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || ""),
  );

  let cumTotal = 0;
  let cumCust = 0;
  let cumTest = 0;

  const globalRegistrationsTimeline = allChronologicalUsers.map((u, idx) => {
    cumTotal++;
    const isTest = testUserIds.has(u.userId);
    if (isTest) cumTest++;
    else cumCust++;

    const userLogins = loginsByUserId.get(u.userId) || [];
    return {
      index: idx + 1,
      registeredAt: u.createdAt,
      email: maskEmails ? maskEmail(u.email) : u.email,
      userId: u.userId,
      category: isTest ? "test" : "customer",
      status: u.userStatus,
      growth: {
        cumulativeTotal: cumTotal,
        cumulativeCustomers: cumCust,
        cumulativeTests: cumTest,
      },
      loginsSummary: {
        totalLogins: userLogins.length,
        firstLoginAt: userLogins.length > 0 ? userLogins[0].timestamp : null,
        lastLoginAt: userLogins.length > 0 ? userLogins[userLogins.length - 1].timestamp : null,
        lastDevice:
          userLogins.length > 0
            ? parseDeviceSummary(userLogins[userLogins.length - 1].userAgent)
            : "-",
      },
    };
  });

  const loginsSummary = {
    totalLoginsRecorded: rawLogins.length,
    usersWithLoginsCount: loginsByUserId.size,
    firstRecordedLoginAt: rawLogins.length > 0 ? rawLogins[0].timestamp : null,
    lastRecordedLoginAt: rawLogins.length > 0 ? rawLogins[rawLogins.length - 1].timestamp : null,
    byUser: Object.fromEntries(
      Array.from(loginsByUserId.entries()).map(([sub, logins]) => {
        const u = rawUsers.find((user) => user.userId === sub);
        const emailKey = maskEmails ? maskEmail(u?.email) : u?.email || sub;
        return [
          emailKey,
          {
            userId: sub,
            email: emailKey,
            category: testUserIds.has(sub) ? "test" : "customer",
            loginCount: logins.length,
            firstLoginAt: logins.length > 0 ? logins[0].timestamp : null,
            lastLoginAt: logins.length > 0 ? logins[logins.length - 1].timestamp : null,
            logins: logins.map((l) => ({
              timestamp: l.timestamp,
              ip: l.ip,
              device: parseDeviceSummary(l.userAgent),
              authFlow: l.authFlow,
            })),
          },
        ];
      }),
    ),
    recentLogins: rawLogins
      .slice(-25)
      .reverse()
      .map((l) => {
        const u = rawUsers.find((user) => user.userId === l.sub);
        return {
          timestamp: l.timestamp,
          email: maskEmails ? maskEmail(u?.email) : u?.email || l.sub,
          category: testUserIds.has(l.sub) ? "test" : "customer",
          ip: l.ip,
          device: parseDeviceSummary(l.userAgent),
        };
      }),
  };

  // 8. Gesamt-JSON-Payload strukturieren
  const monitoringData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      generator: "scripts/extract-platform-monitoring.mjs",
      reportType: "two-part-customer-and-internal-tests",
      filterCriteria: {
        knownBaselineTestEmailsCount: DEFAULT_TEST_EMAILS.size,
        customTestEmailsCount: customTestEmails.size,
        testPatterns: [
          "@example.com",
          "+cloud-acceptance@",
          "deletable_*",
          "tenant:cloud-acceptance*",
        ],
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
      customers: {
        totalUsers: customersReport.summary.users.totalRegistered,
        activeUsers: customersReport.summary.users.totalActive,
        activePercent: customersReport.summary.users.activePercent,
        totalSessions: customersReport.summary.activityKPIs.totalTrainingSessions,
        totalRuns: customersReport.summary.activityKPIs.totalScenarioRuns,
        totalPoints: customersReport.summary.activityKPIs.totalPointsAwarded,
      },
      internalTests: {
        totalUsers: internalTestsReport.summary.users.totalRegistered,
        activeUsers: internalTestsReport.summary.users.totalActive,
        activePercent: internalTestsReport.summary.users.activePercent,
        totalSessions: internalTestsReport.summary.activityKPIs.totalTrainingSessions,
        totalRuns: internalTestsReport.summary.activityKPIs.totalScenarioRuns,
        totalPoints: internalTestsReport.summary.activityKPIs.totalPointsAwarded,
      },
      combined: {
        totalUsers: combinedReport.summary.users.totalRegistered,
        activeUsers: combinedReport.summary.users.totalActive,
        activePercent: combinedReport.summary.users.activePercent,
        totalSessions: combinedReport.summary.activityKPIs.totalTrainingSessions,
        totalRuns: combinedReport.summary.activityKPIs.totalScenarioRuns,
        totalPoints: combinedReport.summary.activityKPIs.totalPointsAwarded,
      },
    },
    timelines: {
      registrations: globalRegistrationsTimeline,
      logins: loginsSummary,
    },
    customers: customersReport,
    internalTests: internalTestsReport,
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

  // 9. In Datei schreiben
  writeFileSync(outputPath, `${JSON.stringify(monitoringData, null, 2)}\n`, "utf8");

  // Reiner E-Mail-Listen-Modus
  if (values["list-emails"]) {
    if (viewMode === "customers") {
      for (const u of customersReport.growth.usersDirectory) {
        if (u.email) console.log(u.email);
      }
    } else if (viewMode === "tests") {
      for (const u of internalTestsReport.growth.usersDirectory) {
        if (u.email) console.log(u.email);
      }
    } else {
      console.log("# Kunden-E-Mails:");
      if (customersReport.growth.usersDirectory.length === 0) {
        console.log("(Keine Kunden-E-Mails registriert)");
      }
      for (const u of customersReport.growth.usersDirectory) {
        if (u.email) console.log(`[Kunde] ${u.email}`);
      }
      console.log("\n# Test-/Entwicklungs-E-Mails:");
      for (const u of internalTestsReport.growth.usersDirectory) {
        if (u.email) console.log(`[Test]  ${u.email}`);
      }
    }
    return;
  }

  // 10. Kompaktes, übersichtliches Terminal-Dashboard ausgeben
  if (!quiet) {
    const fileSizeKb = Math.round(statSync(outputPath).size / 1024);

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

    // TABELLE 1: KUNDEN VS. INTERNE TESTS
    if (viewMode === "all") {
      console.log("\nÜBERSICHT (KUNDEN vs. INTERNE TESTS):");
      const c = customersReport;
      const t = internalTestsReport;
      const all = combinedReport;

      const summaryRows = [
        [
          "Registrierte Benutzer",
          String(c.summary.users.totalRegistered),
          String(t.summary.users.totalRegistered),
          String(all.summary.users.totalRegistered),
        ],
        [
          "Aktive Benutzer (mit Interaktion)",
          `${c.summary.users.totalActive} (${c.summary.users.activePercent}%)`,
          `${t.summary.users.totalActive} (${t.summary.users.activePercent}%)`,
          `${all.summary.users.totalActive} (${all.summary.users.activePercent}%)`,
        ],
        [
          "Aktiv in den letzten 30 Tagen",
          String(c.summary.activityKPIs.activeUsersLast30Days),
          String(t.summary.activityKPIs.activeUsersLast30Days),
          String(all.summary.activityKPIs.activeUsersLast30Days),
        ],
        [
          "Aufgezeichnete Anmeldungen (Logins)",
          String(
            c.growth.usersDirectory.reduce((sum, u) => sum + (u.loginHistory?.totalLogins || 0), 0),
          ),
          String(
            t.growth.usersDirectory.reduce((sum, u) => sum + (u.loginHistory?.totalLogins || 0), 0),
          ),
          String(rawLogins.length),
        ],
        [
          "Trainings-Sitzungen (Sessions)",
          String(c.summary.activityKPIs.totalTrainingSessions),
          String(t.summary.activityKPIs.totalTrainingSessions),
          String(all.summary.activityKPIs.totalTrainingSessions),
        ],
        [
          "Abgeschlossene Durchläufe (Runs)",
          String(c.summary.activityKPIs.totalScenarioRuns),
          String(t.summary.activityKPIs.totalScenarioRuns),
          String(all.summary.activityKPIs.totalScenarioRuns),
        ],
        [
          "Durchschn. Durchlaufzeit",
          c.summary.activityKPIs.averageRunDurationSeconds
            ? `${c.summary.activityKPIs.averageRunDurationSeconds}s`
            : "-",
          t.summary.activityKPIs.averageRunDurationSeconds
            ? `${t.summary.activityKPIs.averageRunDurationSeconds}s`
            : "-",
          all.summary.activityKPIs.averageRunDurationSeconds
            ? `${all.summary.activityKPIs.averageRunDurationSeconds}s`
            : "-",
        ],
        [
          "Vergebene Punkte",
          `${c.summary.activityKPIs.totalPointsAwarded} Pkt`,
          `${t.summary.activityKPIs.totalPointsAwarded} Pkt`,
          `${all.summary.activityKPIs.totalPointsAwarded} Pkt`,
        ],
        [
          "Ausgestellte Zertifikate",
          String(c.summary.activityKPIs.totalAttestationsIssued),
          String(t.summary.activityKPIs.totalAttestationsIssued),
          String(all.summary.activityKPIs.totalAttestationsIssued),
        ],
      ];

      console.log(
        renderTable(["Kennzahl", "Kunden (Produktiv)", "Interne Tests", "Gesamt"], summaryRows, [
          "left",
          "right",
          "right",
          "right",
        ]),
      );
    } else if (viewMode === "customers") {
      console.log("\nKUNDEN-ÜBERSICHT (PRODUKTIV):");
      const c = customersReport;
      const customerRows = [
        ["Registrierte Kunden", String(c.summary.users.totalRegistered)],
        [
          "Aktive Kunden (mit Interaktion)",
          `${c.summary.users.totalActive} (${c.summary.users.activePercent}%)`,
        ],
        ["Aktiv in den letzten 30 Tagen", String(c.summary.activityKPIs.activeUsersLast30Days)],
        [
          "Aufgezeichnete Anmeldungen",
          String(
            c.growth.usersDirectory.reduce((sum, u) => sum + (u.loginHistory?.totalLogins || 0), 0),
          ),
        ],
        ["Trainings-Sitzungen (Sessions)", String(c.summary.activityKPIs.totalTrainingSessions)],
        ["Abgeschlossene Durchläufe (Runs)", String(c.summary.activityKPIs.totalScenarioRuns)],
        [
          "Durchschn. Durchlaufzeit",
          c.summary.activityKPIs.averageRunDurationSeconds
            ? `${c.summary.activityKPIs.averageRunDurationSeconds}s`
            : "-",
        ],
        ["Vergebene Punkte", `${c.summary.activityKPIs.totalPointsAwarded} Pkt`],
        ["Ausgestellte Zertifikate", String(c.summary.activityKPIs.totalAttestationsIssued)],
      ];
      console.log(renderTable(["Kennzahl", "Wert"], customerRows, ["left", "right"]));
    } else if (viewMode === "tests") {
      console.log("\nTEST- & ENTWICKLUNGS-ÜBERSICHT:");
      const t = internalTestsReport;
      const testRows = [
        ["Registrierte Test-Accounts", String(t.summary.users.totalRegistered)],
        [
          "Aktive Test-Accounts",
          `${t.summary.users.totalActive} (${t.summary.users.activePercent}%)`,
        ],
        ["Aktiv in den letzten 30 Tagen", String(t.summary.activityKPIs.activeUsersLast30Days)],
        [
          "Aufgezeichnete Anmeldungen",
          String(
            t.growth.usersDirectory.reduce((sum, u) => sum + (u.loginHistory?.totalLogins || 0), 0),
          ),
        ],
        ["Trainings-Sitzungen (Sessions)", String(t.summary.activityKPIs.totalTrainingSessions)],
        ["Abgeschlossene Durchläufe (Runs)", String(t.summary.activityKPIs.totalScenarioRuns)],
        [
          "Durchschn. Durchlaufzeit",
          t.summary.activityKPIs.averageRunDurationSeconds
            ? `${t.summary.activityKPIs.averageRunDurationSeconds}s`
            : "-",
        ],
        ["Vergebene Punkte", `${t.summary.activityKPIs.totalPointsAwarded} Pkt`],
        ["Ausgestellte Zertifikate", String(t.summary.activityKPIs.totalAttestationsIssued)],
      ];
      console.log(renderTable(["Kennzahl", "Wert"], testRows, ["left", "right"]));
    }

    // TABELLE 2: ZEITLICHER VERLAUF DER REGISTRIERUNGEN
    console.log("\nZEITLICHER VERLAUF DER REGISTRIERUNGEN (CHRONOLOGISCH):");
    const timelineRows = globalRegistrationsTimeline
      .filter((item) => {
        if (viewMode === "customers" && item.category !== "customer") return false;
        if (viewMode === "tests" && item.category !== "test") return false;
        if (
          filterUser &&
          !item.email?.toLowerCase().includes(filterUser) &&
          item.userId !== filterUser
        ) {
          return false;
        }
        return true;
      })
      .map((item) => [
        String(item.index),
        formatGermanDateTime(item.registeredAt),
        item.email || "(keine E-Mail)",
        `[${item.category === "customer" ? "Kunde" : "Test"}]`,
        item.status || "-",
        `+1 (Kunde: ${item.growth.cumulativeCustomers} | Test: ${item.growth.cumulativeTests} | Gesamt: ${item.growth.cumulativeTotal})`,
      ]);

    if (timelineRows.length === 0) {
      console.log("  (Keine Registrierungen in dieser Filteransicht)");
    } else {
      console.log(
        renderTable(
          ["#", "Registriert am", "E-Mail-Adresse", "Typ", "Status", "Kumulatives Wachstum"],
          timelineRows,
          ["right", "center", "left", "center", "left", "left"],
        ),
      );
    }

    // TABELLE 3: ANMELDEHISTORIE JE BENUTZER (ÜBERSICHT)
    console.log("\nANMELDEHISTORIE JE BENUTZER:");
    const userLoginSummaryRows = allChronologicalUsers
      .filter((u) => {
        const isTest = testUserIds.has(u.userId);
        if (viewMode === "customers" && isTest) return false;
        if (viewMode === "tests" && !isTest) return false;
        if (filterUser && !u.email?.toLowerCase().includes(filterUser) && u.userId !== filterUser) {
          return false;
        }
        return true;
      })
      .map((u, idx) => {
        const isTest = testUserIds.has(u.userId);
        const userLogins = loginsByUserId.get(u.userId) || [];
        const firstLogin =
          userLogins.length > 0 ? formatGermanDateTime(userLogins[0].timestamp) : "-";
        const lastLogin =
          userLogins.length > 0
            ? formatGermanDateTime(userLogins[userLogins.length - 1].timestamp)
            : "-";
        const lastDevice =
          userLogins.length > 0
            ? parseDeviceSummary(userLogins[userLogins.length - 1].userAgent)
            : "-";
        const emailDisp = maskEmails ? maskEmail(u.email) : u.email || "(keine E-Mail)";

        return [
          String(idx + 1),
          emailDisp,
          `[${isTest ? "Test" : "Kunde"}]`,
          firstLogin,
          lastLogin,
          String(userLogins.length),
          lastDevice,
        ];
      });

    if (userLoginSummaryRows.length === 0) {
      console.log("  (Keine Benutzer in dieser Filteransicht)");
    } else {
      console.log(
        renderTable(
          [
            "#",
            "E-Mail-Adresse",
            "Typ",
            "Erste Anmeldung",
            "Letzte Anmeldung",
            "Logins",
            "Letztes Gerät",
          ],
          userLoginSummaryRows,
          ["right", "left", "center", "center", "center", "right", "left"],
        ),
      );
    }

    // DETAIL-AUSGABE DER EINZELNEN ANMELDEZEITPUNKTE
    if (showLogins) {
      console.log(
        "\n====================================================================================================",
      );
      console.log(" EINZELNE ANMELDEZEITPUNKTE JE BENUTZER (AUSFÜHRLICHE LISTE)");
      console.log(
        "====================================================================================================",
      );

      for (const u of allChronologicalUsers) {
        const isTest = testUserIds.has(u.userId);
        if (viewMode === "customers" && isTest) continue;
        if (viewMode === "tests" && !isTest) continue;
        if (filterUser && !u.email?.toLowerCase().includes(filterUser) && u.userId !== filterUser) {
          continue;
        }

        const emailDisp = maskEmails ? maskEmail(u.email) : u.email || u.userId;
        const userLogins = loginsByUserId.get(u.userId) || [];
        console.log(
          `\nBENUTZER: ${emailDisp} [${isTest ? "Test" : "Kunde"}] — ${userLogins.length} erfolgreiche Anmeldungen`,
        );

        if (userLogins.length === 0) {
          console.log("  (Keine Anmeldungen in CloudTrail aufgezeichnet)");
        } else {
          const detailRows = userLogins.map((l, lIdx) => [
            String(lIdx + 1),
            formatGermanDateTimeSeconds(l.timestamp),
            l.ip || "-",
            parseDeviceSummary(l.userAgent),
            l.authFlow || "SRP",
          ]);
          console.log(
            renderTable(
              ["#", "Zeitpunkt (Datum & Uhrzeit)", "IP-Adresse", "Gerät / Browser", "Auth-Methode"],
              detailRows,
              ["right", "center", "left", "left", "center"],
            ),
          );
        }
      }
    } else {
      if (rawLogins.length > 0) {
        console.log("\nJÜNGSTE ANMELDUNGEN (LETZTE 5 GLOBAL):");
        const recentRows = rawLogins
          .slice(-5)
          .reverse()
          .map((l, rIdx) => {
            const u = rawUsers.find((user) => user.userId === l.sub);
            const isTest = testUserIds.has(l.sub);
            const emailDisp = maskEmails ? maskEmail(u?.email) : u?.email || l.sub;
            return [
              String(rIdx + 1),
              formatGermanDateTimeSeconds(l.timestamp),
              emailDisp,
              `[${isTest ? "Test" : "Kunde"}]`,
              l.ip || "-",
              parseDeviceSummary(l.userAgent),
            ];
          });
        console.log(
          renderTable(
            ["#", "Zeitpunkt", "Benutzer / E-Mail", "Typ", "IP-Adresse", "Gerät"],
            recentRows,
            ["right", "center", "left", "center", "left", "left"],
          ),
        );
      }
      console.log(
        "\n💡 Tipp: Mit 'npm run platform:monitoring:logins' (oder '--logins') werden alle einzelnen",
      );
      console.log(
        "   Anmeldezeitpunkte jedes Benutzers mit sekundengenauer Uhrzeit, IP und Gerät aufgeschlüsselt.",
      );
    }

    // TABELLE 4: TOP SZENARIEN NACH INTERAKTION
    if (!showTimeline && !showLogins) {
      const scenarioList = [];
      if (viewMode === "all" || viewMode === "customers") {
        for (const sc of customersReport.interactions.byScenario) {
          scenarioList.push({ ...sc, type: "Kunde" });
        }
      }
      if (viewMode === "all" || viewMode === "tests") {
        for (const sc of internalTestsReport.interactions.byScenario) {
          scenarioList.push({ ...sc, type: "Test" });
        }
      }
      scenarioList.sort((a, b) => b.totalRuns + b.totalSessions - (a.totalRuns + a.totalSessions));

      if (scenarioList.length > 0) {
        console.log("\nTOP SZENARIEN NACH INTERAKTION:");
        const scenarioRows = scenarioList
          .slice(0, 6)
          .map((sc) => [
            sc.scenarioId,
            `[${sc.type}]`,
            String(sc.totalRuns),
            String(sc.totalSessions),
            String(sc.uniqueUsersCount),
            `${sc.totalPointsAwarded} Pkt`,
          ]);

        console.log(
          renderTable(["Szenario", "Typ", "Runs", "Sessions", "Nutzer", "Punkte"], scenarioRows, [
            "left",
            "center",
            "right",
            "right",
            "right",
            "right",
          ]),
        );
      }
    }

    // TABELLE 5: BENUTZER & AKTIVITÄTS-STATUS
    if (!showLogins) {
      const displayedUsers = [];
      if (viewMode === "all" || viewMode === "customers") {
        for (const u of customersReport.growth.usersDirectory) {
          displayedUsers.push({ ...u, category: "Kunde" });
        }
      }
      if (viewMode === "all" || viewMode === "tests") {
        for (const u of internalTestsReport.growth.usersDirectory) {
          displayedUsers.push({ ...u, category: "Test" });
        }
      }

      console.log(`\nBENUTZER-AKTIVITÄTSSTATUS (${displayedUsers.length}):`);
      if (displayedUsers.length === 0) {
        console.log("  (Keine Benutzer in dieser Ansicht vorhanden)");
      } else {
        const userRows = displayedUsers.map((u, idx) => {
          let actStr = "Inaktiv";
          if (u.engagement.isActive) {
            const parts = [];
            if (u.engagement.runsCount > 0) parts.push(`${u.engagement.runsCount} Runs`);
            if (u.engagement.sessionsCount > 0)
              parts.push(`${u.engagement.sessionsCount} Sessions`);
            if (u.engagement.totalPoints > 0) parts.push(`${u.engagement.totalPoints} Pkt`);
            if (u.loginHistory?.totalLogins > 0) parts.push(`${u.loginHistory.totalLogins} Logins`);
            actStr = parts.join(", ") || "Aktiv";
          }
          return [
            String(idx + 1),
            u.email || "(keine E-Mail)",
            `[${u.category}]`,
            u.status || "-",
            formatGermanDate(u.createdAt),
            actStr,
          ];
        });

        console.log(
          renderTable(["#", "E-Mail-Adresse", "Typ", "Status", "Registr.", "Aktivität"], userRows, [
            "right",
            "left",
            "center",
            "left",
            "center",
            "left",
          ]),
        );
      }
    }

    console.log(
      "\n----------------------------------------------------------------------------------------------------",
    );
    console.log(`✓ JSON-Export bereitgestellt: ${outputPath} (${fileSizeKb} KB)`);
    if (customersReport.summary.users.totalRegistered === 0) {
      console.log(
        "ℹ Hinweis: Alle 7 aktuellen Accounts sind Test-Accounts. Sobald sich neue Kunden registrieren,",
      );
      console.log(
        "  fließen sie automatisch und sauber isoliert in die Spalte 'Kunden (Produktiv)'.",
      );
    }
    console.log(
      "----------------------------------------------------------------------------------------------------\n",
    );
  }
}

main().catch((err) => {
  logError("\nFEHLER bei der Extraktion der Plattform-Daten:");
  logError(err.message || err);
  process.exit(1);
});
