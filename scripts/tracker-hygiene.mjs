#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Tracker-Hygiene-Guard.
//
// Drei Zustaende duerfen im Board nicht still bestehen bleiben und werden deshalb maschinell
// erkannt. Die verbindliche Beschreibung steht in docs/29-tracker-hygiene.md.
//
//   must-ownership         offenes `prio: must`- oder `beta:gate`-Issue ohne genau eine
//                          Zuweisung (`stream:*`) oder bewusste Parkentscheidung (`work:parked`)
//   pr-closed-unmerged     PR ohne Merge geschlossen, ohne Abschlussgrund
//   issue-closed-unproven  Issue geschlossen, ohne dass Code auf `main` es belegt, und ohne
//                          Abschlussgrund wie `wontfix` oder `duplicate`
//
// Ein Verstoss wird sichtbar gemacht, nicht still repariert: Label `hygiene:violation`, ein
// Kommentar mit dem naechsten exakten Schritt, und ein falsch geschlossenes Element wird wieder
// geoeffnet. Ein Guard, der nur meldet, waere nach einer Woche Rauschen; einer, der selbst
// Abschlussgruende erfindet, wuerde genau die Entscheidung verdecken, die er einfordert.
//
// Aufrufe:
//   node scripts/tracker-hygiene.mjs --sweep [--apply]
//   node scripts/tracker-hygiene.mjs --event <payload.json> [--apply] [--no-grace]
//
// Ohne `--apply` laeuft der Guard trocken und gibt nur aus, was er taete.

export const POLICY = Object.freeze({
  // Elemente, die vor diesem Zeitpunkt geschlossen wurden, sind Altbestand und werden nicht
  // rueckwirkend wiedereroeffnet.
  activeSince: "2026-10-02T00:00:00Z",
  // Wer zuerst schliesst und dann das Label setzt, soll nicht sofort wiedereroeffnet werden.
  graceSeconds: 120,
  // Sicherheitsnetz fuer verpasste Events; der stuendliche Sweep schaut so weit zurueck.
  sweepLookbackDays: 3,
  violationLabel: "hygiene:violation",
  mustSelectorLabels: ["prio: must", "beta:gate"],
  streamLabels: ["stream:chat1", "stream:chat2", "stream:chat3", "stream:owner"],
  parkedLabel: "work:parked",
  exemptLabelPrefixes: ["control:"],
  epicLabel: "type: epic",
  resolutionLabels: ["wontfix", "duplicate", "superseded", "invalid"],
  referenceRequiredLabels: ["duplicate", "superseded"],
});

export const RULES = Object.freeze({
  mustOwnership: "must-ownership",
  pullClosedUnmerged: "pr-closed-unmerged",
  issueClosedUnproven: "issue-closed-unproven",
});

const DOC_LINK = "docs/29-tracker-hygiene.md";
const REOPEN_FAILED_TEXT = "Wiederöffnen war nicht möglich";
const MARKER_PREFIX = "<!-- tracker-hygiene:rule=";

// Verweis auf Nachfolger oder Original, z. B. "Superseded by #541", "Ersetzt durch #541",
// "Duplicate of owner/repo#87" oder "Superseded by https://github.com/owner/repo/pull/541".
// Ein Verweis auf das Element selbst zaehlt nicht.
const REFERENCE_PATTERN =
  /\b(?:superseded by|replaced by|duplicate of|ersetzt durch|abgel(?:ö|oe)st durch|duplikat von|nachfolger)\s*:?\s*(?:https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/|(?:[\w.-]+\/[\w.-]+)?#)(\d+)/giu;

export function findSuccessorReference(texts, selfNumber) {
  for (const text of texts) {
    for (const match of (text ?? "").matchAll(REFERENCE_PATTERN)) {
      const referenced = Number(match[1]);
      if (referenced !== selfNumber) return referenced;
    }
  }
  return null;
}

export function normalizeItem(raw) {
  return {
    number: raw.number,
    title: raw.title ?? "",
    kind: raw.pull_request ? "pull" : "issue",
    state: raw.state,
    stateReason: raw.state_reason ?? null,
    merged: Boolean(raw.pull_request?.merged_at),
    labels: (raw.labels ?? []).map((label) => (typeof label === "string" ? label : label.name)),
    body: raw.body ?? "",
    closedAt: raw.closed_at ?? null,
  };
}

function isExempt(item) {
  return item.labels.some((label) =>
    POLICY.exemptLabelPrefixes.some((prefix) => label.startsWith(prefix)),
  );
}

function violation(rule, title, detail, nextStep, { reopen }) {
  return { rule, title, detail, nextStep, reopen };
}

const RESOLUTION_STEP =
  "Abschlussgrund als Label setzen — `wontfix` (wird nicht umgesetzt), `invalid` (trifft nicht zu), " +
  "`duplicate` oder `superseded` — bei den beiden letzten zusätzlich einen Kommentar wie " +
  "`Superseded by #123` bzw. `Duplicate of #123` schreiben, dann schließen.";

function evaluateResolution(item, texts, { markedAsDuplicate = false } = {}) {
  const labels = item.labels.filter((label) => POLICY.resolutionLabels.includes(label));
  if (labels.length === 0) return { status: "missing" };
  const needsReference = labels.find((label) => POLICY.referenceRequiredLabels.includes(label));
  const referenced = markedAsDuplicate || findSuccessorReference(texts, item.number) !== null;
  if (needsReference && !referenced) {
    return { status: "missing-reference", label: needsReference };
  }
  return { status: "ok" };
}

function missingReferenceViolation(rule, item, label) {
  return violation(
    rule,
    `Label \`${label}\` ohne Verweis`,
    `#${item.number} trägt \`${label}\`, aber weder Beschreibung noch Kommentare nennen, wohin die Arbeit gegangen ist.`,
    "Einen Kommentar wie `Superseded by #123` bzw. `Duplicate of #123` schreiben, dann wieder schließen.",
    { reopen: true },
  );
}

export function evaluateMustOwnership(item) {
  if (item.kind !== "issue" || item.state !== "open" || isExempt(item)) return null;
  const selectors = item.labels.filter((label) => POLICY.mustSelectorLabels.includes(label));
  if (selectors.length === 0) return null;

  const streams = item.labels.filter((label) => POLICY.streamLabels.includes(label));
  const parked = item.labels.includes(POLICY.parkedLabel);
  if ((streams.length === 1 && !parked) || (streams.length === 0 && parked)) return null;

  const scope = selectors.map((label) => `\`${label}\``).join(" + ");
  if (streams.length === 0) {
    return violation(
      RULES.mustOwnership,
      "Pflicht-Issue ohne Zuweisung",
      `#${item.number} ist ${scope}, aber keinem Worker zugewiesen und nicht bewusst geparkt.`,
      `Genau ein Label aus ${POLICY.streamLabels.map((label) => `\`${label}\``).join(", ")} setzen — oder \`${POLICY.parkedLabel}\` mit Begründung im Issue, wenn es bewusst nicht bearbeitet wird.`,
      { reopen: false },
    );
  }
  return violation(
    RULES.mustOwnership,
    "Pflicht-Issue mit widersprüchlicher Zuweisung",
    `#${item.number} trägt ${[...streams, ...(parked ? [POLICY.parkedLabel] : [])]
      .map((label) => `\`${label}\``)
      .join(", ")}. Zugewiesen ist es genau einem Stream, oder es ist geparkt — nicht beides.`,
    "Alle Labels bis auf das eine gültige entfernen.",
    { reopen: false },
  );
}

export function evaluateClosedPullRequest(item, { comments }) {
  if (item.kind !== "pull" || item.state !== "closed" || item.merged || isExempt(item)) {
    return null;
  }
  const texts = [item.body, ...comments.map((comment) => comment.body)];
  const resolution = evaluateResolution(item, texts);
  if (resolution.status === "ok") return null;
  if (resolution.status === "missing-reference") {
    return missingReferenceViolation(RULES.pullClosedUnmerged, item, resolution.label);
  }
  return violation(
    RULES.pullClosedUnmerged,
    "PR ohne Merge und ohne Abschlussgrund geschlossen",
    `#${item.number} wurde geschlossen, ohne gemergt zu werden. Ohne Abschlussgrund ist nicht nachvollziehbar, ob die Änderung ersetzt, verworfen oder vergessen wurde.`,
    RESOLUTION_STEP,
    { reopen: true },
  );
}

/**
 * Code-Beleg fuer ein als erledigt geschlossenes Issue: ein gemergter PR desselben Repositories
 * verweist darauf, oder ein Commit auf dem Integrationsbranch nennt `#<nummer>`. Ein Commit
 * auf einem Feature-Branch genuegt nicht -- solange er nicht auf `main` liegt, ist nichts erledigt.
 */
export function hasCodeEvidence(number, { timeline, mainCommitMessages, repository }) {
  const ownRepository = repository.toLowerCase();
  const mergedPullReference = timeline.some(
    (event) =>
      event.event === "cross-referenced" &&
      Boolean(event.source?.issue?.pull_request?.merged_at) &&
      (event.source.issue.html_url ?? "").toLowerCase().includes(`/${ownRepository}/pull/`),
  );
  if (mergedPullReference) return true;

  // `#123` oder `owner/repo#123` dieses Repositories. Nicht: `other/repo#123`, ein Fork wie
  // `fork-owner/repo#123`, Anker in URLs und Hex-Farben wie `#123abc` -- sonst belegte ein
  // fremder Verweis ein eigenes Issue. Die Grenze steht deshalb vor dem optionalen Praefix.
  const escaped = ownRepository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reference = new RegExp(`(?:^|[^\\w/.#-])(?:${escaped})?#${number}(?!\\w)`, "im");
  return mainCommitMessages.some((message) => reference.test(message));
}

export function evaluateClosedIssue(item, context) {
  if (item.kind !== "issue" || item.state !== "closed" || isExempt(item)) return null;
  const texts = [item.body, ...context.comments.map((comment) => comment.body)];
  // "Close as duplicate" in der GitHub-Oberflaeche verlangt das Original und haelt es als
  // Timeline-Ereignis fest; das ist ein ebenso guter Verweis wie ein Kommentar.
  const markedAsDuplicate = context.timeline.some((event) => event.event === "marked_as_duplicate");
  const resolution = evaluateResolution(item, texts, { markedAsDuplicate });
  if (resolution.status === "ok") return null;
  if (resolution.status === "missing-reference") {
    return missingReferenceViolation(RULES.issueClosedUnproven, item, resolution.label);
  }

  if (item.stateReason === "duplicate") {
    if (markedAsDuplicate || findSuccessorReference(texts, item.number) !== null) return null;
    return violation(
      RULES.issueClosedUnproven,
      "Als Duplikat geschlossen, ohne Original",
      `#${item.number} wurde als Duplikat geschlossen, nennt aber nicht, wovon.`,
      "Einen Kommentar `Duplicate of #123` schreiben und das Label `duplicate` setzen, dann wieder schließen.",
      { reopen: true },
    );
  }

  if (item.stateReason === "not_planned") {
    return violation(
      RULES.issueClosedUnproven,
      "Als „not planned“ geschlossen, ohne Abschlussgrund",
      `#${item.number} wurde ohne Codeänderung geschlossen, aber ohne Label, das den Grund benennt.`,
      RESOLUTION_STEP,
      { reopen: true },
    );
  }

  if (item.labels.includes(POLICY.epicLabel) && context.subIssues.length > 0) {
    const open = context.subIssues.filter((subIssue) => subIssue.state !== "closed");
    if (open.length === 0) return null;
    return violation(
      RULES.issueClosedUnproven,
      "Epic geschlossen, obwohl Sub-Issues offen sind",
      `#${item.number} wurde als erledigt geschlossen, offen sind noch ${open
        .map((subIssue) => `#${subIssue.number}`)
        .join(", ")}.`,
      "Die offenen Sub-Issues erst abschließen oder umhängen, dann das Epic schließen.",
      { reopen: true },
    );
  }

  if (hasCodeEvidence(item.number, context)) return null;
  return violation(
    RULES.issueClosedUnproven,
    "Als erledigt geschlossen, ohne Code-Beleg",
    `#${item.number} wurde als erledigt geschlossen, aber weder ein gemergter PR noch ein Commit auf \`main\` verweist darauf.`,
    `Wenn die Arbeit per Code erledigt ist: den PR mergen, der \`Closes #${item.number}\` trägt — er schließt das Issue dann selbst. Wenn keine Codeänderung nötig war: ${RESOLUTION_STEP}`,
    { reopen: true },
  );
}

// --- Kommentare als Zustand ------------------------------------------------------------------
//
// Pro Element und Regel gibt es hoechstens einen Guard-Kommentar. Er traegt den Zustand
// (offen/behoben) im Marker, damit der Guard nach einer Wiedereroeffnung weiss, dass das Element
// noch einen korrekten Abschluss schuldet -- auch wenn es offen gerade keine Regel verletzt.

function markerFor(rule, state) {
  return `${MARKER_PREFIX}${rule} state=${state} -->`;
}

export function parseMarkers(comments) {
  const markers = [];
  for (const comment of comments) {
    const body = comment.body ?? "";
    if (!body.startsWith(MARKER_PREFIX)) continue;
    const match = /^<!-- tracker-hygiene:rule=([\w-]+) state=(open|resolved) -->/.exec(body);
    if (match) markers.push({ id: comment.id, rule: match[1], open: match[2] === "open", body });
  }
  return markers;
}

export function renderViolationComment(finding, { reopened, reopenFailed }) {
  const lines = [
    markerFor(finding.rule, "open"),
    `### Tracker-Hygiene: ${finding.title}`,
    "",
    finding.detail,
    "",
    `**Nächster Schritt:** ${finding.nextStep}`,
  ];
  if (reopened) {
    lines.push("", "Deshalb wurde dieses Element wieder geöffnet.");
  }
  if (reopenFailed) {
    lines.push(
      "",
      `${REOPEN_FAILED_TEXT} (${reopenFailed}). Das Label \`${POLICY.violationLabel}\` bleibt, bis der Abschlussgrund nachgetragen ist.`,
    );
  }
  lines.push(
    "",
    `<sub>Regel \`${finding.rule}\` · Beschreibung in \`${DOC_LINK}\` · Dieser Kommentar wird aktualisiert, sobald der Verstoß behoben ist.</sub>`,
  );
  return lines.join("\n");
}

function renderResolvedComment(rule) {
  return [
    markerFor(rule, "resolved"),
    "### Tracker-Hygiene: behoben",
    "",
    `Regel \`${rule}\` ist erfüllt. Kein weiterer Schritt nötig.`,
  ].join("\n");
}

/**
 * Bringt Label, Guard-Kommentare und Zustand eines Elements mit den aktuellen Befunden in
 * Einklang. `flagNew: false` meldet keine neuen must-ownership-Befunde, sondern raeumt nur auf:
 * bei Label-Events waere das Zwischenstadium "prio gesetzt, Stream noch nicht" sonst ein
 * Fehlalarm. Neue Befunde dieser Art meldet der stuendliche Sweep.
 */
export async function reconcileItem(
  client,
  item,
  findings,
  { comments, apply, log, flagNew = true },
) {
  const markers = parseMarkers(comments);
  const openMarkers = markers.filter((marker) => marker.open);
  const hasLabel = item.labels.includes(POLICY.violationLabel);
  const actions = [];

  const reported = findings.filter(
    (finding) =>
      flagNew ||
      finding.rule !== RULES.mustOwnership ||
      openMarkers.some((marker) => marker.rule === finding.rule),
  );

  for (const finding of reported) {
    const existing = markers.find((marker) => marker.rule === finding.rule);
    // Ein Wiederoeffnen, das schon gescheitert ist, etwa weil der PR-Branch geloescht wurde,
    // wird nicht in jedem Sweep erneut versucht. Der Kommentar nennt den Abschlussgrund als
    // Ausweg, und Label-Events werten das Element ohnehin neu aus.
    if (finding.reopen && existing?.open && existing.body.includes(REOPEN_FAILED_TEXT)) {
      continue;
    }
    let reopened = false;
    let reopenFailed = null;
    if (finding.reopen && item.state === "closed") {
      actions.push(`wiederöffnen (${finding.rule})`);
      if (apply) {
        try {
          await (item.kind === "pull" ? client.reopenPull : client.reopenIssue)(item.number);
          reopened = true;
        } catch (error) {
          reopenFailed = `HTTP ${error.status ?? "?"}`;
        }
      }
    }
    const body = renderViolationComment(finding, { reopened, reopenFailed });
    if (!existing) {
      actions.push(`kommentieren (${finding.rule})`);
      if (apply) await client.createComment(item.number, body);
    } else if (existing.body !== body) {
      actions.push(`Kommentar aktualisieren (${finding.rule})`);
      if (apply) await client.updateComment(existing.id, body);
    }
  }

  // Ein wiedereroeffnetes Element schuldet weiter einen korrekten Abschluss; dieser Befund
  // bleibt offen, solange das Element offen ist, und erledigt sich erst beim naechsten
  // regelkonformen Schliessen.
  const reportedRules = new Set(reported.map((finding) => finding.rule));
  const pending = openMarkers.filter(
    (marker) =>
      !reportedRules.has(marker.rule) &&
      item.state === "open" &&
      marker.rule !== RULES.mustOwnership,
  );
  const resolved = openMarkers.filter(
    (marker) => !reportedRules.has(marker.rule) && !pending.includes(marker),
  );
  for (const marker of resolved) {
    actions.push(`als behoben markieren (${marker.rule})`);
    if (apply) await client.updateComment(marker.id, renderResolvedComment(marker.rule));
  }

  const shouldCarryLabel = reported.length > 0 || pending.length > 0;
  if (shouldCarryLabel && !hasLabel) {
    actions.push(`Label ${POLICY.violationLabel} setzen`);
    if (apply) await client.addLabels(item.number, [POLICY.violationLabel]);
  } else if (!shouldCarryLabel && hasLabel) {
    actions.push(`Label ${POLICY.violationLabel} entfernen`);
    if (apply) await client.removeLabel(item.number, POLICY.violationLabel);
  }

  if (actions.length > 0) {
    log(`#${item.number} ${item.title}: ${actions.join(", ")}${apply ? "" : " [dry-run]"}`);
  }
  return { reported, pending, resolved, actions };
}

// --- GitHub-Zugriff --------------------------------------------------------------------------

export function createGitHubClient({ repository, token, apiUrl, fetchImpl = fetch }) {
  if (!/^[^/]+\/[^/]+$/.test(repository ?? "")) {
    throw new Error("GITHUB_REPOSITORY muss im Format owner/name gesetzt sein.");
  }
  if (!token) throw new Error("GITHUB_TOKEN fehlt.");
  const base = `${apiUrl ?? "https://api.github.com"}/repos/${repository}`;

  async function request(method, pathname, body) {
    const response = await fetchImpl(`${base}${pathname}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const error = new Error(
        `${method} ${pathname} -> HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  // Seitenweise ueber `page`, nicht ueber Link-Header: das funktioniert unveraendert auch hinter
  // Proxies, die Link-Header mit numerischen Repository-Pfaden nicht durchreichen.
  async function paginate(pathname, params = {}) {
    const results = [];
    for (let page = 1; page <= 50; page += 1) {
      const query = new URLSearchParams({ ...params, per_page: "100", page: String(page) });
      const batch = await request("GET", `${pathname}?${query}`);
      results.push(...batch);
      if (batch.length < 100) break;
    }
    return results;
  }

  return {
    getItem: (number) => request("GET", `/issues/${number}`),
    listItems: (params) => paginate("/issues", params),
    listComments: (number) => paginate(`/issues/${number}/comments`),
    listTimeline: (number) => paginate(`/issues/${number}/timeline`),
    listSubIssues: (number) => paginate(`/issues/${number}/sub_issues`),
    addLabels: (number, labels) => request("POST", `/issues/${number}/labels`, { labels }),
    removeLabel: (number, label) =>
      request("DELETE", `/issues/${number}/labels/${encodeURIComponent(label)}`),
    createComment: (number, body) => request("POST", `/issues/${number}/comments`, { body }),
    updateComment: (id, body) => request("PATCH", `/issues/comments/${id}`, { body }),
    reopenIssue: (number) => request("PATCH", `/issues/${number}`, { state: "open" }),
    reopenPull: (number) => request("PATCH", `/pulls/${number}`, { state: "open" }),
  };
}

// --- Ablauf ----------------------------------------------------------------------------------

export function readMainCommitMessages(ref, cwd) {
  const output = execFileSync("git", ["log", "--format=%B%x1e", ref], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split("\x1e").filter((message) => message.trim().length > 0);
}

/** Wertet ein Element vollstaendig aus und gleicht es ab. */
export async function checkItem(client, raw, context) {
  const item = normalizeItem(raw);
  const needsComments =
    item.state === "closed" ||
    item.labels.includes(POLICY.violationLabel) ||
    evaluateMustOwnership(item) !== null;
  if (!needsComments) return { item, findings: [], actions: [] };

  const comments = await client.listComments(item.number);
  const findings = [];
  const ownership = evaluateMustOwnership(item);
  if (ownership) findings.push(ownership);

  if (item.state === "closed" && !isExempt(item)) {
    if (item.kind === "pull") {
      const finding = evaluateClosedPullRequest(item, { comments });
      if (finding) findings.push(finding);
    } else {
      const timeline = await client.listTimeline(item.number);
      const subIssues = item.labels.includes(POLICY.epicLabel)
        ? await client.listSubIssues(item.number)
        : [];
      const finding = evaluateClosedIssue(item, {
        comments,
        timeline,
        subIssues,
        mainCommitMessages: context.mainCommitMessages,
        repository: context.repository,
      });
      if (finding) findings.push(finding);
    }
  }

  const result = await reconcileItem(client, item, findings, {
    comments,
    apply: context.apply,
    log: context.log,
    flagNew: context.flagNew ?? true,
  });
  return { item, findings, ...result };
}

function closedAfterActivation(item) {
  return item.closedAt !== null && Date.parse(item.closedAt) >= Date.parse(POLICY.activeSince);
}

function outsideGrace(item, now) {
  return now - Date.parse(item.closedAt) >= POLICY.graceSeconds * 1000;
}

// Vor der Aktivierung geschlossene Elemente sind Altbestand und bleiben unangetastet -- es sei
// denn, der Guard selbst hat sie markiert und raeumt nun auf.
function isLegacy(item) {
  return (
    item.state === "closed" &&
    !closedAfterActivation(item) &&
    !item.labels.includes(POLICY.violationLabel)
  );
}

export async function runSweep(client, context) {
  const now = context.now ?? Date.now();
  const lookback = Math.max(
    Date.parse(POLICY.activeSince),
    now - POLICY.sweepLookbackDays * 24 * 60 * 60 * 1000,
  );
  const candidates = new Map();
  const add = (raw) => candidates.set(raw.number, raw);

  for (const label of POLICY.mustSelectorLabels) {
    (await client.listItems({ state: "open", labels: label })).forEach(add);
  }
  (await client.listItems({ state: "all", labels: POLICY.violationLabel })).forEach(add);
  for (const raw of await client.listItems({
    state: "closed",
    since: new Date(lookback).toISOString(),
  })) {
    const item = normalizeItem(raw);
    if (closedAfterActivation(item) && outsideGrace(item, now)) add(raw);
  }

  // Ein Fehler bei einem Element (etwa eine nicht erreichbare Sub-Issue-API) ueberspringt nur
  // dieses Element, und zwar vor jeder Mutation: ein unvollstaendig ausgewertetes Epic darf
  // nicht als "ohne Beleg" wiedereroeffnet werden. Der Lauf meldet sich am Ende als fehlerhaft.
  const results = [];
  for (const raw of [...candidates.values()].sort((left, right) => left.number - right.number)) {
    if (isLegacy(normalizeItem(raw))) continue;
    try {
      results.push(await checkItem(client, raw, context));
    } catch (error) {
      context.log(`#${raw.number}: übersprungen, ${error.message}`);
      results.push({ item: normalizeItem(raw), findings: [], actions: [], error: error.message });
    }
  }
  return results;
}

// Die Karenzzeit gibt Gelegenheit, nach dem Schliessen noch Label oder Verweis nachzutragen. Ein
// gemergter PR oder ein Element mit einem Abschlussgrund ohne Verweispflicht (`wontfix`,
// `invalid`) braucht nichts mehr; `superseded` und `duplicate` warten weiter auf den Verweis.
function closedSettled(event) {
  const payload = event.pull_request ?? event.issue ?? {};
  if (payload.merged === true) return true;
  const labels = (payload.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  return labels.some(
    (label) =>
      POLICY.resolutionLabels.includes(label) && !POLICY.referenceRequiredLabels.includes(label),
  );
}

export async function runEvent(client, event, context) {
  const number = event.issue?.number ?? event.pull_request?.number;
  if (!number) {
    context.log("Event ohne Issue- oder PR-Bezug, nichts zu tun.");
    return [];
  }
  const closing = event.action === "closed";
  if (closing && context.graceSeconds > 0 && !closedSettled(event)) {
    await context.sleep(context.graceSeconds * 1000);
  }
  const raw = await client.getItem(number);
  if (isLegacy(normalizeItem(raw))) {
    context.log(`#${number} wurde vor ${POLICY.activeSince} geschlossen (Altbestand).`);
    return [];
  }
  return [await checkItem(client, raw, { ...context, flagNew: closing })];
}

function parseArgs(argv) {
  const options = { apply: false, sweep: false, event: null, grace: true, mainRef: "HEAD" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--sweep") options.sweep = true;
    else if (arg === "--no-grace") options.grace = false;
    else if (arg === "--event") options.event = argv[(index += 1)];
    else if (arg === "--main-ref") options.mainRef = argv[(index += 1)];
    else throw new Error(`Unbekanntes Argument: ${arg}`);
  }
  if (options.sweep === Boolean(options.event)) {
    throw new Error("Genau eines von --sweep oder --event <payload.json> angeben.");
  }
  return options;
}

function writeSummary(results, apply) {
  const lines = results
    .filter((result) => result.actions.length > 0 || result.error)
    .map(
      (result) =>
        `- #${result.item.number} ${result.item.title}: ${
          result.error ? `übersprungen (${result.error})` : result.actions.join(", ")
        }`,
    );
  const summary = [
    `## Tracker-Hygiene${apply ? "" : " (dry-run)"}`,
    "",
    lines.length > 0 ? lines.join("\n") : "Keine Abweichung gefunden.",
    "",
  ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repository = process.env.GITHUB_REPOSITORY;
  const client = createGitHubClient({
    repository,
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
  });
  const context = {
    apply: options.apply,
    repository,
    mainCommitMessages: readMainCommitMessages(options.mainRef, process.cwd()),
    graceSeconds: options.grace ? POLICY.graceSeconds : 0,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    log: (message) => console.log(message),
  };
  const results = options.sweep
    ? await runSweep(client, context)
    : await runEvent(client, JSON.parse(readFileSync(options.event, "utf8")), context);
  writeSummary(results, options.apply);
  if (results.some((result) => result.error)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
