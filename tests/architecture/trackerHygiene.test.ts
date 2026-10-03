import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  POLICY,
  RULES,
  evaluateClosedIssue,
  evaluateClosedPullRequest,
  evaluateMustOwnership,
  findSuccessorReference,
  hasCodeEvidence,
  normalizeItem,
  parseMarkers,
  reconcileItem,
  runEvent,
  runSweep,
} from "../../scripts/tracker-hygiene.mjs";

// Der Tracker-Hygiene-Guard entscheidet, ob ein geschlossenes Element wieder geoeffnet wird.
// Diese Tests halten die Regeln aus docs/29-tracker-hygiene.md fest und pruefen den Abgleich
// gegen einen In-Memory-Tracker statt gegen GitHub: entscheidend ist, welche Schreibaufrufe
// der Guard ausloest, und genau die sind hier vollstaendig beobachtbar.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repository = "owner/repo";

type Raw = {
  number: number;
  title?: string;
  state: "open" | "closed";
  state_reason?: string | null;
  labels?: string[];
  body?: string;
  closed_at?: string | null;
  pull_request?: { merged_at: string | null };
};

type Comment = { id: number; body: string };
type TimelineEvent = Record<string, unknown>;

function issue(overrides: Partial<Raw> & { number: number }): Raw {
  return { state: "open", labels: [], body: "", title: `Item ${overrides.number}`, ...overrides };
}

function closedIssue(overrides: Partial<Raw> & { number: number }): Raw {
  return issue({ state: "closed", state_reason: "completed", closed_at: closedAt, ...overrides });
}

function closedPull(overrides: Partial<Raw> & { number: number }): Raw {
  return issue({
    state: "closed",
    closed_at: closedAt,
    pull_request: { merged_at: null },
    ...overrides,
  });
}

const closedAt = "2026-10-03T10:00:00Z";
const later = Date.parse("2026-10-03T12:00:00Z");

function mergedPullReference(number: number): TimelineEvent {
  return {
    event: "cross-referenced",
    source: {
      issue: {
        html_url: `https://github.com/${repository}/pull/${number}`,
        pull_request: { merged_at: "2026-10-03T09:59:00Z" },
      },
    },
  };
}

function openPullReference(number: number): TimelineEvent {
  return {
    event: "cross-referenced",
    source: {
      issue: {
        html_url: `https://github.com/${repository}/pull/${number}`,
        pull_request: { merged_at: null },
      },
    },
  };
}

function closedIssueContext(
  overrides: Partial<{
    comments: Comment[];
    timeline: TimelineEvent[];
    subIssues: { number: number; state: string }[];
    mainCommitMessages: string[];
  }> = {},
) {
  return {
    comments: [],
    timeline: [],
    subIssues: [],
    mainCommitMessages: [],
    repository,
    ...overrides,
  };
}

/** In-Memory-Tracker, der jeden Schreibaufruf protokolliert. */
function fakeTracker(items: Raw[], extras: Record<number, Partial<FakeExtras>> = {}) {
  const state = new Map(items.map((item) => [item.number, structuredClone(item)]));
  const comments = new Map<number, Comment[]>();
  const writes: string[] = [];
  let nextCommentId = 1;
  for (const [number, extra] of Object.entries(extras)) {
    comments.set(Number(number), extra.comments ?? []);
  }

  const client = {
    getItem: async (number: number) => structuredClone(state.get(number)),
    listItems: async (params: Record<string, string>) =>
      [...state.values()].filter(
        (item) =>
          (params.state === "all" || item.state === params.state) &&
          (!params.labels || (item.labels ?? []).includes(params.labels)),
      ),
    listComments: async (number: number) => structuredClone(comments.get(number) ?? []),
    listTimeline: async (number: number) => extras[number]?.timeline ?? [],
    listSubIssues: async (number: number) => extras[number]?.subIssues ?? [],
    addLabels: async (number: number, labels: string[]) => {
      writes.push(`label+ #${number} ${labels.join(",")}`);
      state.get(number)!.labels = [...(state.get(number)!.labels ?? []), ...labels];
    },
    removeLabel: async (number: number, label: string) => {
      writes.push(`label- #${number} ${label}`);
      state.get(number)!.labels = (state.get(number)!.labels ?? []).filter((l) => l !== label);
    },
    createComment: async (number: number, body: string) => {
      writes.push(`comment #${number}`);
      comments.set(number, [...(comments.get(number) ?? []), { id: nextCommentId++, body }]);
    },
    updateComment: async (id: number, body: string) => {
      writes.push(`comment~ ${id}`);
      for (const list of comments.values()) {
        const found = list.find((comment) => comment.id === id);
        if (found) found.body = body;
      }
    },
    reopenIssue: async (number: number) => {
      writes.push(`reopen #${number}`);
      state.get(number)!.state = "open";
    },
    reopenPull: async (number: number) => {
      writes.push(`reopen #${number}`);
      if (extras[number]?.reopenFails) {
        throw Object.assign(new Error("branch deleted"), { status: 422 });
      }
      state.get(number)!.state = "open";
    },
  };
  return { client, state, comments, writes };
}

type FakeExtras = {
  comments: Comment[];
  timeline: TimelineEvent[];
  subIssues: { number: number; state: string }[];
  reopenFails: boolean;
};

function context(overrides: Record<string, unknown> = {}) {
  const logs: string[] = [];
  return {
    logs,
    value: {
      apply: true,
      repository,
      mainCommitMessages: [] as string[],
      graceSeconds: 0,
      sleep: async () => {},
      log: (message: string) => logs.push(message),
      now: later,
      ...overrides,
    },
  };
}

// --- must-ownership -----------------------------------------------------------------------

test("must-ownership meldet ein Pflicht-Issue ohne Zuweisung", () => {
  const finding = evaluateMustOwnership(
    normalizeItem(issue({ number: 1, labels: ["prio: must"] })),
  );
  assert.equal(finding?.rule, RULES.mustOwnership);
  assert.equal(finding?.reopen, false);
});

test("must-ownership gilt auch fuer beta:gate ohne prio: must", () => {
  const finding = evaluateMustOwnership(normalizeItem(issue({ number: 1, labels: ["beta:gate"] })));
  assert.equal(finding?.rule, RULES.mustOwnership);
});

test("must-ownership akzeptiert genau einen Stream oder eine bewusste Parkentscheidung", () => {
  for (const labels of [
    ["prio: must", "stream:chat1"],
    ["prio: must", "stream:owner"],
    ["prio: must", POLICY.parkedLabel],
  ]) {
    assert.equal(evaluateMustOwnership(normalizeItem(issue({ number: 1, labels }))), null);
  }
});

test("must-ownership meldet widerspruechliche Zuweisungen", () => {
  for (const labels of [
    ["prio: must", "stream:chat1", "stream:chat2"],
    ["prio: must", "stream:chat3", POLICY.parkedLabel],
  ]) {
    const finding = evaluateMustOwnership(normalizeItem(issue({ number: 1, labels })));
    assert.equal(finding?.title, "Pflicht-Issue mit widersprüchlicher Zuweisung");
  }
});

test("must-ownership ignoriert should-Issues, PRs, geschlossene und CONTROL-Issues", () => {
  const cases: Raw[] = [
    issue({ number: 1, labels: ["prio: should"] }),
    issue({ number: 2, labels: ["prio: must"], pull_request: { merged_at: null } }),
    closedIssue({ number: 3, labels: ["prio: must"] }),
    issue({ number: 4, labels: ["prio: must", "control:active"] }),
  ];
  for (const raw of cases) assert.equal(evaluateMustOwnership(normalizeItem(raw)), null);
});

// --- Verweise -----------------------------------------------------------------------------

test("Nachfolger- und Duplikat-Verweise werden in gaengigen Formen erkannt", () => {
  assert.equal(findSuccessorReference(["Superseded by #541"], 531), 541);
  assert.equal(findSuccessorReference(["ersetzt durch #537"], 536), 537);
  assert.equal(findSuccessorReference(["Abgelöst durch #12"], 1), 12);
  assert.equal(findSuccessorReference(["Duplicate of owner/repo#87"], 90), 87);
  assert.equal(findSuccessorReference(["Nachfolger: #600"], 514), 600);
  assert.equal(
    findSuccessorReference(["Superseded by https://github.com/dimto13/ai-tutor-lab/pull/541"], 531),
    541,
  );
  assert.equal(
    findSuccessorReference(["Duplicate of https://github.com/owner/repo/issues/87"], 90),
    87,
  );
});

test("ein Verweis auf das Element selbst oder ohne Schluesselwort zaehlt nicht", () => {
  assert.equal(findSuccessorReference(["Superseded by #531"], 531), null);
  assert.equal(findSuccessorReference(["siehe #541"], 531), null);
  assert.equal(
    findSuccessorReference(["Superseded by https://github.com/owner/repo/pull/531"], 531),
    null,
  );
});

// --- pr-closed-unmerged ---------------------------------------------------------------------

test("ein ohne Merge und ohne Grund geschlossener PR wird gemeldet und soll wieder auf", () => {
  const finding = evaluateClosedPullRequest(normalizeItem(closedPull({ number: 531 })), {
    comments: [],
  });
  assert.equal(finding?.rule, RULES.pullClosedUnmerged);
  assert.equal(finding?.reopen, true);
});

test("ein gemergter PR ist nie ein Verstoss", () => {
  const raw = closedPull({ number: 541, pull_request: { merged_at: "2026-10-01T03:53:56Z" } });
  assert.equal(evaluateClosedPullRequest(normalizeItem(raw), { comments: [] }), null);
});

test("wontfix und invalid genuegen, superseded und duplicate brauchen einen Verweis", () => {
  for (const label of ["wontfix", "invalid"]) {
    const raw = closedPull({ number: 10, labels: [label] });
    assert.equal(evaluateClosedPullRequest(normalizeItem(raw), { comments: [] }), null);
  }

  const superseded = normalizeItem(closedPull({ number: 531, labels: ["superseded"] }));
  assert.equal(
    evaluateClosedPullRequest(superseded, { comments: [] })?.title,
    "Label `superseded` ohne Verweis",
  );
  assert.equal(
    evaluateClosedPullRequest(superseded, { comments: [{ id: 1, body: "Superseded by #541" }] }),
    null,
  );
});

// --- issue-closed-unproven ------------------------------------------------------------------

test("ein erledigtes Issue mit gemergtem PR-Verweis ist belegt", () => {
  const item = normalizeItem(closedIssue({ number: 528 }));
  const ctx = closedIssueContext({ timeline: [mergedPullReference(541)] });
  assert.equal(evaluateClosedIssue(item, ctx), null);
});

test("ein nur offener oder fremder PR-Verweis ist kein Code-Beleg", () => {
  const item = normalizeItem(closedIssue({ number: 521 }));
  const foreign = mergedPullReference(9);
  (foreign.source as { issue: { html_url: string } }).issue.html_url =
    "https://github.com/other/repo/pull/9";
  const ctx = closedIssueContext({ timeline: [openPullReference(534), foreign] });
  assert.equal(evaluateClosedIssue(item, ctx)?.title, "Als erledigt geschlossen, ohne Code-Beleg");
});

test("ein Commit auf main mit Issue-Referenz ist ein Code-Beleg, ohne Praefix-Treffer", () => {
  const messages = ["fix(#528,#529,#530): make the chapter completion save path honest (#541)"];
  assert.equal(
    hasCodeEvidence(529, { timeline: [], mainCommitMessages: messages, repository }),
    true,
  );
  assert.equal(
    hasCodeEvidence(52, { timeline: [], mainCommitMessages: messages, repository }),
    false,
  );
});

test("fremde Repository-Verweise, Anker und Hex-Farben sind kein Code-Beleg", () => {
  const evidence = (message: string) =>
    hasCodeEvidence(123, { timeline: [], mainCommitMessages: [message], repository });
  assert.equal(evidence("fix: port upstream/other#123"), false);
  assert.equal(evidence("docs: link https://example.com/page#123"), false);
  assert.equal(evidence("style: use #123abc for the badge"), false);
  assert.equal(evidence("fix: aus fork-owner/repo#123 portiert"), false);
  assert.equal(evidence("docs: siehe https://github.com/owner/repo#123"), false);
  assert.equal(evidence("fix(owner/repo#123): eigener Verweis mit Repository"), true);
  assert.equal(evidence("feat: abgeschlossen\n\n#123 erledigt"), true);
});

test("der PR-Verweis wird ohne Ruecksicht auf Gross-/Kleinschreibung zugeordnet", () => {
  const reference = mergedPullReference(541);
  (reference.source as { issue: { html_url: string } }).issue.html_url =
    "https://github.com/Owner/Repo/pull/541";
  assert.equal(
    hasCodeEvidence(528, { timeline: [reference], mainCommitMessages: [], repository }),
    true,
  );
});

test("not planned ohne Abschlussgrund-Label wird gemeldet, mit wontfix nicht", () => {
  const bare = normalizeItem(closedIssue({ number: 7, state_reason: "not_planned" }));
  assert.equal(
    evaluateClosedIssue(bare, closedIssueContext())?.title,
    "Als „not planned“ geschlossen, ohne Abschlussgrund",
  );
  const labelled = normalizeItem(
    closedIssue({ number: 7, state_reason: "not_planned", labels: ["wontfix"] }),
  );
  assert.equal(evaluateClosedIssue(labelled, closedIssueContext()), null);
});

test("ein Duplikat braucht das Original, per Kommentar oder GitHub-Duplikatmarkierung", () => {
  const item = normalizeItem(
    closedIssue({ number: 87, state_reason: "duplicate", labels: ["duplicate"] }),
  );
  assert.equal(
    evaluateClosedIssue(item, closedIssueContext())?.title,
    "Label `duplicate` ohne Verweis",
  );
  assert.equal(
    evaluateClosedIssue(item, closedIssueContext({ timeline: [{ event: "marked_as_duplicate" }] })),
    null,
  );
  const unlabelled = normalizeItem(closedIssue({ number: 87, state_reason: "duplicate" }));
  assert.equal(
    evaluateClosedIssue(
      unlabelled,
      closedIssueContext({ comments: [{ id: 1, body: "Duplicate of #95" }] }),
    ),
    null,
  );
});

test("ein Epic ist erledigt, wenn alle Sub-Issues geschlossen sind", () => {
  const epic = normalizeItem(closedIssue({ number: 76, labels: ["type: epic"] }));
  const done = closedIssueContext({ subIssues: [{ number: 23, state: "closed" }] });
  assert.equal(evaluateClosedIssue(epic, done), null);
  const open = closedIssueContext({
    subIssues: [
      { number: 23, state: "closed" },
      { number: 24, state: "open" },
    ],
  });
  assert.equal(
    evaluateClosedIssue(epic, open)?.title,
    "Epic geschlossen, obwohl Sub-Issues offen sind",
  );
});

test("CONTROL-Issues sind ausgenommen, auch archivierte", () => {
  const archived = normalizeItem(closedIssue({ number: 514, labels: ["control:archived"] }));
  assert.equal(evaluateClosedIssue(archived, closedIssueContext()), null);
});

// --- Abgleich -------------------------------------------------------------------------------

test("ein falsch geschlossenes Issue wird wieder geoeffnet, gelabelt und kommentiert", async () => {
  const tracker = fakeTracker([closedIssue({ number: 7 })]);
  const { value } = context();
  await runEvent(tracker.client, { action: "closed", issue: { number: 7 } }, value);

  assert.deepEqual(tracker.writes, [
    "reopen #7",
    "comment #7",
    `label+ #7 ${POLICY.violationLabel}`,
  ]);
  assert.equal(tracker.state.get(7)?.state, "open");
  const [marker] = parseMarkers(tracker.comments.get(7) ?? []);
  assert.equal(marker?.rule, RULES.issueClosedUnproven);
  assert.equal(marker?.open, true);
});

test("das Label bleibt, solange ein wiedergeoeffnetes Element den Abschluss schuldet", async () => {
  const tracker = fakeTracker([closedIssue({ number: 7 })]);
  const { value } = context();
  await runEvent(tracker.client, { action: "closed", issue: { number: 7 } }, value);
  tracker.writes.length = 0;

  await runSweep(tracker.client, value);
  assert.deepEqual(tracker.writes, []);
  assert.ok(tracker.state.get(7)?.labels?.includes(POLICY.violationLabel));
});

test("ein regelkonformer Abschluss raeumt Label und Kommentar auf", async () => {
  const tracker = fakeTracker([closedIssue({ number: 7 })]);
  const { value } = context();
  await runEvent(tracker.client, { action: "closed", issue: { number: 7 } }, value);
  tracker.writes.length = 0;

  const reopened = tracker.state.get(7)!;
  reopened.state = "closed";
  reopened.state_reason = "not_planned";
  reopened.labels = [...(reopened.labels ?? []), "wontfix"];
  await runEvent(tracker.client, { action: "closed", issue: { number: 7 } }, value);

  assert.deepEqual(tracker.writes, ["comment~ 1", `label- #7 ${POLICY.violationLabel}`]);
  assert.equal(parseMarkers(tracker.comments.get(7) ?? [])[0]?.open, false);
});

test("ein wiederholter Lauf erzeugt keinen zweiten Kommentar", async () => {
  const tracker = fakeTracker([issue({ number: 1, labels: ["prio: must"] })]);
  const { value } = context();
  await runSweep(tracker.client, value);
  await runSweep(tracker.client, value);
  assert.deepEqual(tracker.writes, ["comment #1", `label+ #1 ${POLICY.violationLabel}`]);
});

test("Label-Events melden keine neue Pflicht-Luecke, raeumen eine behobene aber auf", async () => {
  const tracker = fakeTracker([issue({ number: 1, labels: ["prio: must"] })]);
  const { value } = context();
  await runEvent(tracker.client, { action: "labeled", issue: { number: 1 } }, value);
  assert.deepEqual(tracker.writes, []);

  await runSweep(tracker.client, value);
  tracker.writes.length = 0;
  tracker.state.get(1)!.labels = ["prio: must", "stream:chat2", POLICY.violationLabel];
  await runEvent(tracker.client, { action: "labeled", issue: { number: 1 } }, value);
  assert.deepEqual(tracker.writes, ["comment~ 1", `label- #1 ${POLICY.violationLabel}`]);
});

test("ein nicht wiederzuoeffnender PR behaelt Label und nennt den Grund", async () => {
  const tracker = fakeTracker([closedPull({ number: 531 })], { 531: { reopenFails: true } });
  const { value } = context();
  await runEvent(tracker.client, { action: "closed", pull_request: { number: 531 } }, value);

  assert.deepEqual(tracker.writes, [
    "reopen #531",
    "comment #531",
    `label+ #531 ${POLICY.violationLabel}`,
  ]);
  assert.match(tracker.comments.get(531)?.[0]?.body ?? "", /HTTP 422/);
});

test("ein gescheitertes Wiederoeffnen wird nicht in jedem Sweep wiederholt", async () => {
  const tracker = fakeTracker([closedPull({ number: 531 })], { 531: { reopenFails: true } });
  const { value } = context();
  await runEvent(tracker.client, { action: "closed", pull_request: { number: 531 } }, value);
  tracker.writes.length = 0;

  await runSweep(tracker.client, value);
  await runSweep(tracker.client, value);
  assert.deepEqual(tracker.writes, []);
  assert.ok(tracker.state.get(531)?.labels?.includes(POLICY.violationLabel));
});

test("die Karenzzeit entfaellt nur, wenn nichts mehr nachzutragen ist", async () => {
  const cases: { event: Record<string, unknown>; raw: Raw; waits: boolean }[] = [
    {
      event: { action: "closed", pull_request: { number: 541, merged: true } },
      raw: closedPull({ number: 541, pull_request: { merged_at: closedAt } }),
      waits: false,
    },
    {
      event: { action: "closed", issue: { number: 7, labels: [{ name: "wontfix" }] } },
      raw: closedIssue({ number: 7, state_reason: "not_planned", labels: ["wontfix"] }),
      waits: false,
    },
    {
      event: { action: "closed", pull_request: { number: 531, labels: [{ name: "superseded" }] } },
      raw: closedPull({ number: 531, labels: ["superseded"] }),
      waits: true,
    },
    {
      event: { action: "closed", issue: { number: 8, labels: [] } },
      raw: closedIssue({ number: 8 }),
      waits: true,
    },
  ];
  for (const { event, raw, waits } of cases) {
    const sleeps: number[] = [];
    const tracker = fakeTracker([raw]);
    const { value } = context({
      apply: false,
      graceSeconds: 120,
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
      },
    });
    await runEvent(tracker.client, event, value);
    assert.deepEqual(sleeps, waits ? [120_000] : [], JSON.stringify(event));
  }
});

test("Altbestand vor der Aktivierung wird nicht angefasst", async () => {
  const tracker = fakeTracker([closedPull({ number: 490, closed_at: "2026-09-15T08:00:00Z" })]);
  const { value } = context();
  await runEvent(tracker.client, { action: "closed", pull_request: { number: 490 } }, value);
  await runSweep(tracker.client, value);
  assert.deepEqual(tracker.writes, []);
});

test("der Sweep laesst Elemente innerhalb der Karenzzeit in Ruhe", async () => {
  const justClosed = new Date(later - 30 * 1000).toISOString();
  const tracker = fakeTracker([closedPull({ number: 600, closed_at: justClosed })]);
  const { value } = context();
  await runSweep(tracker.client, value);
  assert.deepEqual(tracker.writes, []);
});

test("ein Fehler bei einem Element ueberspringt nur dieses, ohne es anzufassen", async () => {
  const tracker = fakeTracker([
    closedIssue({ number: 76, labels: ["type: epic"] }),
    issue({ number: 1, labels: ["prio: must"] }),
  ]);
  tracker.client.listSubIssues = async () => {
    throw Object.assign(new Error("HTTP 404"), { status: 404 });
  };
  const { value } = context();
  const results = await runSweep(tracker.client, value);

  // Das Epic wird nicht als "ohne Beleg" wiedergeoeffnet, der Rest des Sweeps laeuft weiter.
  assert.deepEqual(tracker.writes, ["comment #1", `label+ #1 ${POLICY.violationLabel}`]);
  assert.equal(results.find((result) => result.item.number === 76)?.error, "HTTP 404");
});

test("ohne --apply schreibt der Guard nichts", async () => {
  const tracker = fakeTracker([closedIssue({ number: 7 })]);
  const { value, logs } = context({ apply: false });
  await runEvent(tracker.client, { action: "closed", issue: { number: 7 } }, value);
  assert.deepEqual(tracker.writes, []);
  assert.match(logs.join("\n"), /\[dry-run\]/);
});

test("reconcileItem markiert eine behobene Pflicht-Luecke auf geschlossenem Issue als behoben", async () => {
  const tracker = fakeTracker([closedIssue({ number: 3, labels: [POLICY.violationLabel] })]);
  const item = normalizeItem(tracker.state.get(3)!);
  const comments = [
    { id: 9, body: `<!-- tracker-hygiene:rule=${RULES.mustOwnership} state=open -->` },
  ];
  const result = await reconcileItem(tracker.client, item, [], {
    comments,
    apply: true,
    log: () => {},
  });
  assert.equal(result.resolved.length, 1);
  assert.deepEqual(tracker.writes, ["comment~ 9", `label- #3 ${POLICY.violationLabel}`]);
});

// --- Workflow-Vertrag -----------------------------------------------------------------------

test("der Workflow fuehrt keinen PR-Code mit Schreibrechten aus", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/tracker-hygiene.yml"), "utf8");
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head/);
  assert.doesNotMatch(workflow, /\bref:/);
  assert.doesNotMatch(workflow, /npm (ci|install)/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.match(workflow, /scripts\/tracker-hygiene\.mjs/);
});
