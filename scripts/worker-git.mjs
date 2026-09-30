#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Ausfuehrbarer, bewachter Git-Pfad fuer Implementierungs-Worker.
//
// Die verbindlichen Regeln stehen in AGENTS.md: eigener Feature-Branch, Rebase auf den dann
// aktuellen `main` unmittelbar vor dem Merge, Force-Push ausschliesslich als
// `--force-with-lease` auf den eigenen Feature-Branch, niemals auf `main` oder `deploy`.
//
// Dieses Werkzeug setzt genau diese Regeln als einen Pfad um, statt sie jeden Lauf aus
// einzelnen Git-Aufrufen neu zusammensetzen zu lassen. Jede Handrekonstruktion ist eine
// Gelegenheit, den Rebase zu ueberspringen, blind zu forcen oder den Commit eines parallel
// arbeitenden Workers zu ueberschreiben. Ein Abbruch nennt deshalb immer den naechsten
// exakten Befehl: ein Werkzeug, das nur "nein" sagt, wird umgangen.
//
// Aufrufe:
//   npm run worker:doctor
//   npm run worker:start -- <branch>
//   npm run worker:sync  [-- --allow-deletions]
//   npm run worker:push  [-- --allow-drop]
//   npm run worker:gate

const INTEGRATION_BRANCH = "main";
const RELEASE_BRANCH = "deploy";

// Refs, die dieses Werkzeug niemals auscheckt, rebased oder pusht. `main` ist Integrationsziel,
// `deploy` ist Owner-only Release-Zeiger.
const PROTECTED_BRANCHES = new Set([INTEGRATION_BRANCH, RELEASE_BRANCH]);

// Bereiche, in denen ein Verschwinden gegenueber `main` blockierend ist: bereits erledigte
// Guards, Tests, Workflows, Hooks und Doku duerfen bei einem Rebase nicht stillschweigend
// herausfallen. Eine beabsichtigte Loeschung wird bewusst quittiert, nicht stillschweigend
// durchgelassen.
const PRESERVED_PREFIXES = [
  ".github/workflows/",
  ".githooks/",
  "tests/",
  "scripts/",
  "docs/",
  "AGENTS.md",
  "CLAUDE.md",
];

// Der Probe-Ref traegt ein Praefix: Branch-Naming-Regeln auf dem Remote lehnen praefixlose Namen
// haeufig ab, und ein abgelehnter Probe-Push saehe dann wie ein fehlender Schreibzugriff aus.
const WRITE_PROBE_REF = "refs/heads/worker-probe/write-check";

/**
 * Unterbrochene Git-Vorgaenge samt der Befehle, die sie tatsaechlich aufloesen. Die Liste ist
 * gemeinsam, damit `gate` und die Guards nicht auseinanderlaufen -- und die Befehle haengen am
 * erkannten Vorgang: `git rebase --continue` bei einem unterbrochenen Merge endet in
 * "fatal: No rebase in progress?" und schickt den Aufrufer in die Irre.
 */
const INTERRUPTED_OPERATIONS = [
  {
    entry: "rebase-merge",
    label: "Ein Rebase laeuft noch.",
    resume: "git rebase --continue",
    abort: "git rebase --abort",
  },
  {
    entry: "rebase-apply",
    label: "Ein Rebase oder am-Vorgang laeuft noch.",
    resume: "git rebase --continue",
    abort: "git rebase --abort",
  },
  {
    entry: "MERGE_HEAD",
    label: "Ein Merge laeuft noch.",
    resume: "git commit",
    abort: "git merge --abort",
  },
  {
    entry: "CHERRY_PICK_HEAD",
    label: "Ein Cherry-Pick laeuft noch.",
    resume: "git cherry-pick --continue",
    abort: "git cherry-pick --abort",
  },
  {
    entry: "REVERT_HEAD",
    label: "Ein Revert laeuft noch.",
    resume: "git revert --continue",
    abort: "git revert --abort",
  },
];

function interruptedOperation() {
  const gitDir = inRepo(["rev-parse", "--absolute-git-dir"]).stdout;
  return INTERRUPTED_OPERATIONS.find((operation) => existsSync(path.join(gitDir, operation.entry)));
}

class Abort extends Error {
  constructor(reason, nextActions = []) {
    super(reason);
    this.name = "Abort";
    this.nextActions = nextActions;
  }
}

function abort(reason, nextActions = []) {
  throw new Abort(reason, nextActions);
}

function git(args, { cwd = process.cwd(), allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) {
    abort(`git ist nicht ausfuehrbar: ${result.error.message}`, [
      "Git installieren beziehungsweise in den PATH aufnehmen.",
    ]);
  }
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  if (result.status !== 0 && !allowFailure) {
    abort(`git ${args.join(" ")} ist fehlgeschlagen (Status ${result.status}).`, [
      stderr || stdout || "Keine Git-Ausgabe.",
    ]);
  }
  return { status: result.status, stdout, stderr };
}

const repoRoot = (() => {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(
      "Abbruch: kein Git-Arbeitsbaum. Dieses Werkzeug laeuft nur in einem ausgecheckten Repository.\n",
    );
    process.exit(1);
  }
  return result.stdout.trim();
})();

function inRepo(args, options = {}) {
  return git(args, { cwd: repoRoot, ...options });
}

function currentBranch() {
  const { stdout } = inRepo(["rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout;
}

function shaOf(ref) {
  const { status, stdout } = inRepo(["rev-parse", "--verify", "--quiet", ref], {
    allowFailure: true,
  });
  return status === 0 && stdout !== "" ? stdout : null;
}

function countCommits(range) {
  return Number(inRepo(["rev-list", "--count", range]).stdout);
}

// Der live gelesene Remote-Head. CONTROL verlangt vor einem Force-Update ausdruecklich eine
// Verifikation gegen den echten Remote-Stand, nicht gegen den lokalen Remote-Tracking-Ref,
// der beliebig alt sein kann.
function liveRemoteSha(branch) {
  const { stdout } = inRepo(["ls-remote", "origin", `refs/heads/${branch}`]);
  if (stdout === "") return null;
  const [sha] = stdout.split("\n")[0].split(/\s+/);
  return sha ?? null;
}

function fetchBranch(branch) {
  inRepo(["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
}

function isProtectedBranch(branch) {
  return PROTECTED_BRANCHES.has(branch);
}

// Erlaubt die im Repository verwendeten Praefix-Branches wie `chat1/478-editor-width`.
// Verboten sind leere Segmente, `..`, fuehrende Bindestriche und Ref-Sonderzeichen; ein
// Branchname, den Git erst spaeter ablehnt, wuerde sonst mitten im Pfad auffallen.
function branchNameProblem(branch) {
  if (branch === "") return "Der Branchname ist leer.";
  if (isProtectedBranch(branch)) {
    return `\`${branch}\` ist ein geschuetzter Ref und wird von Workern nicht bearbeitet.`;
  }
  if (!branch.includes("/")) {
    return `\`${branch}\` hat kein Praefix. Erwartet wird zum Beispiel \`chat1/<issue>-<kurzname>\`.`;
  }
  if (!/^[a-z0-9][a-z0-9._/-]*$/.test(branch)) {
    return `\`${branch}\` enthaelt unerlaubte Zeichen. Erlaubt sind Kleinbuchstaben, Ziffern, \`.\`, \`_\`, \`-\` und \`/\`.`;
  }
  if (branch.includes("..") || branch.includes("//") || branch.endsWith("/")) {
    return `\`${branch}\` ist kein gueltiger Ref-Name.`;
  }
  return null;
}

function blockingDeletions(paths) {
  return paths.filter((file) =>
    PRESERVED_PREFIXES.some((prefix) =>
      prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
    ),
  );
}

// Dateien, die es auf `main` gibt und auf dem aktuellen Head nicht mehr.
function deletionsAgainstIntegration() {
  const { stdout } = inRepo([
    "diff",
    "--diff-filter=D",
    "--name-only",
    `origin/${INTEGRATION_BRANCH}`,
    "HEAD",
  ]);
  return stdout === "" ? [] : stdout.split("\n");
}

function requireFeatureBranch() {
  const branch = currentBranch();
  if (branch === "HEAD") {
    abort("HEAD ist detached; es gibt keinen Feature-Branch, auf dem gearbeitet wird.", [
      "Einen Feature-Branch auschecken: git switch <branch>",
      "Oder neu anlegen: npm run worker:start -- <branch>",
    ]);
  }
  if (isProtectedBranch(branch)) {
    abort(
      `\`${branch}\` ist ein geschuetzter Ref. Worker rebasen und pushen weder \`${INTEGRATION_BRANCH}\` noch \`${RELEASE_BRANCH}\`.`,
      ["Auf einen eigenen Feature-Branch wechseln: npm run worker:start -- <branch>"],
    );
  }
  return branch;
}

function requireCleanTree() {
  const { stdout } = inRepo(["status", "--porcelain", "--untracked-files=no"]);
  if (stdout !== "") {
    abort("Der Arbeitsbaum hat nicht eingecheckte Aenderungen an versionierten Dateien.", [
      ...stdout
        .split("\n")
        .slice(0, 20)
        .map((line) => `betroffen: ${line}`),
      "Aenderungen committen oder sichern; ein Rebase oder Push auf ungepruefte Arbeit ist keine Evidence.",
    ]);
  }
}

function requireNoInterruptedOperation() {
  const interrupted = interruptedOperation();
  if (!interrupted) return;
  abort(interrupted.label, [
    `Konflikte aufloesen, dann: git add <dateien> && ${interrupted.resume}`,
    `Oder den Vorgang verwerfen: ${interrupted.abort}`,
    "Danach diesen Befehl erneut ausfuehren.",
  ]);
}

function reportPreservation({ allowDeletions }) {
  const removed = blockingDeletions(deletionsAgainstIntegration());
  if (removed.length === 0) {
    return;
  }
  if (!allowDeletions) {
    abort(
      `Gegenueber \`${INTEGRATION_BRANCH}\` fehlen ${removed.length} geschuetzte Datei(en). Bereits erledigte Guards, Tests, Workflows und Doku duerfen nicht verschwinden.`,
      [
        ...removed.slice(0, 20).map((file) => `fehlt: ${file}`),
        "Wenn die Loeschung nicht gewollt ist: Datei aus dem Integrationsstand zuruecknehmen, zum Beispiel",
        `  git checkout origin/${INTEGRATION_BRANCH} -- <datei>`,
        "Wenn die Loeschung fachlich gewollt und im Ticket-Scope ist, erneut mit --allow-deletions ausfuehren.",
      ],
    );
  }
  process.stdout.write(
    `Hinweis: ${removed.length} geschuetzte Datei(en) sind gegenueber \`${INTEGRATION_BRANCH}\` entfernt und per --allow-deletions quittiert:\n` +
      removed.map((file) => `  - ${file}\n`).join(""),
  );
}

function commandStart(args) {
  // Sonst scheitert `git switch` mit einer rohen Git-Meldung statt mit der Aufloesung.
  requireNoInterruptedOperation();
  const branch = args[0] ?? "";
  const problem = branchNameProblem(branch);
  if (problem) {
    abort(problem, ["Aufruf: npm run worker:start -- <praefix>/<issue>-<kurzname>"]);
  }
  // Bewusst kein Clean-Tree-Zwang: gerade das Retten begonnener Arbeit von einem geschuetzten
  // Ref auf einen Feature-Branch ist ein Hauptgrund fuer diesen Befehl. Git selbst bricht ab,
  // falls der Wechsel lokale Aenderungen ueberschreiben wuerde. Rebase und Push bleiben streng.
  const carried = inRepo(["status", "--porcelain", "--untracked-files=no"]).stdout;

  if (shaOf(`refs/heads/${branch}`)) {
    abort(`Der lokale Branch \`${branch}\` existiert bereits.`, [
      `Fortsetzen statt neu anlegen: git switch ${branch} && npm run worker:sync`,
    ]);
  }
  if (liveRemoteSha(branch)) {
    abort(`Der Remote-Branch \`origin/${branch}\` existiert bereits.`, [
      `Bestehende Arbeit uebernehmen: git fetch origin ${branch} && git switch ${branch}`,
      "Danach: npm run worker:sync",
    ]);
  }

  fetchBranch(INTEGRATION_BRANCH);
  const base = shaOf(`refs/remotes/origin/${INTEGRATION_BRANCH}`);
  inRepo(["switch", "--create", branch, "--no-track", `origin/${INTEGRATION_BRANCH}`]);

  process.stdout.write(
    [
      `Branch \`${branch}\` angelegt.`,
      `  Basis: origin/${INTEGRATION_BRANCH} @ ${base}`,
      carried === ""
        ? null
        : `  mitgenommen: ${carried.split("\n").length} nicht eingecheckte Datei(en)`,
      "",
      "Naechste Schritte: implementieren, committen, dann",
      "  npm run check",
      "  npm run worker:push",
      "",
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );
}

function commandSync(args) {
  const allowDeletions = args.includes("--allow-deletions");
  // Reihenfolge bewusst: waehrend eines laufenden Rebase ist HEAD detached. Erst die
  // Rebase-Pruefung nennt die tatsaechliche Aufloesung statt "detached HEAD".
  requireNoInterruptedOperation();
  const branch = requireFeatureBranch();
  requireCleanTree();

  fetchBranch(INTEGRATION_BRANCH);
  const base = shaOf(`refs/remotes/origin/${INTEGRATION_BRANCH}`);
  const headBefore = shaOf("HEAD");
  const behind = countCommits(`HEAD..origin/${INTEGRATION_BRANCH}`);

  if (behind === 0) {
    process.stdout.write(
      [
        `\`${branch}\` liegt bereits auf der aktuellen Spitze von origin/${INTEGRATION_BRANCH}.`,
        `  Basis: ${base}`,
        `  Head:  ${headBefore}`,
        `  eigene Commits: ${countCommits(`origin/${INTEGRATION_BRANCH}..HEAD`)}`,
        "",
      ].join("\n"),
    );
    reportPreservation({ allowDeletions });
    return;
  }

  const rebase = inRepo(["rebase", `origin/${INTEGRATION_BRANCH}`], { allowFailure: true });
  if (rebase.status !== 0) {
    process.stderr.write(`${rebase.stdout}\n${rebase.stderr}\n`);
    abort(`Der Rebase von \`${branch}\` auf origin/${INTEGRATION_BRANCH} hat Konflikte.`, [
      "Konflikte bewusst aufloesen; auf `main` bereits erledigte Arbeit, Guards, Tests und Workflows duerfen dabei nicht regressieren.",
      "Danach: git add <dateien> && git rebase --continue",
      "Verwerfen: git rebase --abort",
      "Anschliessend: npm run worker:sync",
    ]);
  }

  const behindAfter = countCommits(`HEAD..origin/${INTEGRATION_BRANCH}`);
  if (behindAfter !== 0) {
    abort(
      `Nach dem Rebase liegt \`${branch}\` noch ${behindAfter} Commit(s) hinter origin/${INTEGRATION_BRANCH}.`,
      ["`main` hat sich waehrend des Rebase bewegt. Erneut ausfuehren: npm run worker:sync"],
    );
  }

  reportPreservation({ allowDeletions });

  process.stdout.write(
    [
      `\`${branch}\` ist auf origin/${INTEGRATION_BRANCH} rebasiert.`,
      `  Basis:     ${base}`,
      `  Head vor:  ${headBefore}`,
      `  Head nach: ${shaOf("HEAD")}`,
      `  eigene Commits: ${countCommits(`origin/${INTEGRATION_BRANCH}..HEAD`)}`,
      "",
      "Naechste Schritte:",
      "  npm run check",
      "  npm run worker:push",
      "",
    ].join("\n"),
  );
}

function commandPush(args) {
  const allowDrop = args.includes("--allow-drop");
  requireNoInterruptedOperation();
  const branch = requireFeatureBranch();
  requireCleanTree();

  const localHead = shaOf("HEAD");
  if (!localHead) {
    abort("Der Branch hat keinen Commit.", ["Erst committen, dann pushen."]);
  }

  const remoteHead = liveRemoteSha(branch);

  if (remoteHead === null) {
    inRepo(["push", "--set-upstream", "origin", `refs/heads/${branch}:refs/heads/${branch}`]);
    verifyPublished(branch, localHead);
    process.stdout.write(`\`${branch}\` neu veroeffentlicht: ${localHead}\n`);
    return;
  }

  if (remoteHead === localHead) {
    process.stdout.write(
      `\`origin/${branch}\` steht bereits auf ${localHead}; es gibt nichts zu pushen.\n`,
    );
    return;
  }

  // Patch-Vergleich gegen den echten Remote-Stand: nach einem Rebase haben die eigenen
  // Commits neue SHAs, ihre Patches sind aber lokal vorhanden. Ein Commit, dessen Patch
  // lokal fehlt, stammt daher von jemand anderem und wuerde durch den Force-Push verloren
  // gehen -- genau der Fall, den ein blindes `--force` verschluckt.
  fetchBranch(branch);
  const foreign = inRepo(["cherry", "HEAD", `refs/remotes/origin/${branch}`])
    .stdout.split("\n")
    .filter((line) => line.startsWith("+"))
    .map((line) => line.slice(2));

  if (foreign.length > 0 && !allowDrop) {
    abort(
      `\`origin/${branch}\` hat ${foreign.length} Commit(s), deren Aenderung lokal fehlt. Ein Force-Push wuerde sie verwerfen.`,
      [
        ...foreign
          .slice(0, 20)
          .map((sha) => `  ${inRepo(["log", "-1", "--format=%h %an %s", sha]).stdout}`),
        `Fremden Stand ansehen: git log --oneline HEAD..origin/${branch}`,
        `Uebernehmen: git rebase origin/${branch}`,
        "Nur wenn das Verwerfen bewusst und belegt richtig ist: erneut mit --allow-drop ausfuehren.",
      ],
    );
  }

  // Ausschliesslich `--force-with-lease` mit explizit erwartetem Remote-Stand. Ein blindes
  // `--force` existiert in diesem Pfad nicht.
  inRepo([
    "push",
    "--force-with-lease=" + `refs/heads/${branch}:${remoteHead}`,
    "--set-upstream",
    "origin",
    `refs/heads/${branch}:refs/heads/${branch}`,
  ]);
  verifyPublished(branch, localHead);

  process.stdout.write(
    [
      `\`${branch}\` gepusht.`,
      `  vorher:  ${remoteHead}`,
      `  jetzt:   ${localHead}`,
      foreign.length > 0 ? `  verworfen (quittiert): ${foreign.length} fremde Commit(s)` : null,
      "",
      "Naechster Schritt: frische Exact-Head-CI auf diesem Head abwarten und Reviews pruefen.",
      "",
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );
}

// Nach dem Push wird der Remote erneut live gelesen. Ein Push, dessen Ergebnis nicht
// nachgesehen wurde, ist keine Evidence.
function verifyPublished(branch, expected) {
  const published = liveRemoteSha(branch);
  if (published !== expected) {
    abort(
      `Der Remote steht nach dem Push auf ${published ?? "keinem Ref"}, erwartet war ${expected}.`,
      ["Remote-Stand pruefen: git ls-remote origin " + branch],
    );
  }
}

function commandGate(args) {
  const allowDeletions = args.includes("--allow-deletions");
  const results = [];
  const branch = currentBranch();

  const detached = branch === "HEAD";
  const protectedRef = !detached && isProtectedBranch(branch);
  results.push({
    ok: !detached && !protectedRef,
    label: "eigener Feature-Branch",
    detail: detached ? "HEAD ist detached" : branch,
  });

  const dirty = inRepo(["status", "--porcelain", "--untracked-files=no"]).stdout;
  results.push({
    ok: dirty === "",
    label: "Arbeitsbaum ohne offene Aenderungen",
    detail: dirty === "" ? "clean" : `${dirty.split("\n").length} Datei(en) geaendert`,
  });

  const interrupted = interruptedOperation();
  results.push({
    ok: interrupted === undefined,
    label: "kein unterbrochener Git-Vorgang",
    detail: interrupted ? interrupted.label : "keiner",
  });

  fetchBranch(INTEGRATION_BRANCH);
  const behind = countCommits(`HEAD..origin/${INTEGRATION_BRANCH}`);
  results.push({
    ok: behind === 0,
    label: `behind_by == 0 gegen origin/${INTEGRATION_BRANCH}`,
    detail: `behind_by=${behind}, Basis ${shaOf(`refs/remotes/origin/${INTEGRATION_BRANCH}`)}`,
  });

  const localHead = shaOf("HEAD");
  const remoteHead = detached || protectedRef ? null : liveRemoteSha(branch);
  results.push({
    ok: remoteHead !== null && remoteHead === localHead,
    label: "Remote-Head entspricht dem lokalen Head",
    detail:
      remoteHead === null ? "Branch ist nicht veroeffentlicht" : `${remoteHead} / ${localHead}`,
  });

  // Eine fachlich gewollte Loeschung wird hier genauso quittiert wie in `sync`. Ohne das wuerde
  // `gate` jeden PR blockieren, der im Rahmen seiner Aufgabe unter `tests/`, `scripts/` oder
  // `docs/` aufraeumt -- und ein Gate, das man nicht bestehen kann, wird umgangen.
  const removed = blockingDeletions(deletionsAgainstIntegration());
  results.push({
    ok: removed.length === 0 || allowDeletions,
    label: "keine geschuetzte Datei entfernt",
    detail:
      removed.length === 0
        ? "keine"
        : `${removed.join(", ")}${allowDeletions ? " (per --allow-deletions quittiert)" : ""}`,
  });

  const failed = results.filter((result) => !result.ok);
  process.stdout.write(
    results
      .map((result) => `${result.ok ? "OK  " : "FEHL"}  ${result.label}: ${result.detail}\n`)
      .join(""),
  );
  process.stdout.write(
    [
      "",
      "Dieses Gate prueft nur den lokalen und den Remote-Git-Stand.",
      "Nicht geprueft und weiterhin verbindlich: frische Exact-Head-CI auf diesem Head,",
      "Disposition aller Review-Findings sowie die globale Merge-Lane.",
      "",
    ].join("\n"),
  );

  if (failed.length > 0) {
    abort(`${failed.length} Merge-Voraussetzung(en) sind nicht erfuellt.`, [
      "Rebase und Veroeffentlichung herstellen: npm run worker:sync && npm run worker:push",
    ]);
  }
}

function commandDoctor() {
  const checks = [];
  const add = (ok, label, detail, nextActions = []) =>
    checks.push({ ok, label, detail, nextActions });

  add(true, "Arbeitsbaum", repoRoot);

  const originUrl = inRepo(["remote", "get-url", "origin"], { allowFailure: true });
  if (originUrl.status !== 0) {
    add(false, "Remote `origin`", "nicht konfiguriert", ["git remote add origin <url>"]);
  } else {
    add(true, "Remote `origin`", originUrl.stdout);
  }

  const readAccess = inRepo(
    ["ls-remote", "--heads", "origin", `refs/heads/${INTEGRATION_BRANCH}`],
    { allowFailure: true },
  );
  const readable = readAccess.status === 0 && readAccess.stdout !== "";
  add(
    readable,
    "Lesezugriff auf origin",
    readable
      ? `origin/${INTEGRATION_BRANCH} @ ${readAccess.stdout.split(/\s+/)[0]}`
      : readAccess.stderr || "kein Ergebnis",
    readable ? [] : ["Zugangsdaten beziehungsweise SSH-Schluessel fuer origin pruefen."],
  );

  // Schreibzugriff wird mit einem Dry-Run auf einen Probe-Ref geprueft. Der Dry-Run
  // verhandelt mit dem Remote, legt aber nichts an; danach wird genau das nachgesehen.
  if (readable && shaOf("HEAD")) {
    const probe = inRepo(["push", "--dry-run", "origin", `HEAD:${WRITE_PROBE_REF}`], {
      allowFailure: true,
    });
    const leftover = inRepo(["ls-remote", "origin", WRITE_PROBE_REF], { allowFailure: true });
    const probeCreated = leftover.status === 0 && leftover.stdout !== "";
    add(
      probe.status === 0 && !probeCreated,
      "Schreibzugriff auf origin",
      probe.status === 0
        ? probeCreated
          ? `Probe-Ref ${WRITE_PROBE_REF} wurde angelegt`
          : "Push-Dry-Run akzeptiert, kein Ref angelegt"
        : probe.stderr || "Push-Dry-Run abgelehnt",
      probe.status === 0
        ? probeCreated
          ? [`Probe-Ref entfernen: git push origin --delete ${WRITE_PROBE_REF}`]
          : []
        : [
            "Ohne Schreibzugriff kann dieser Pfad nicht abgeschlossen werden.",
            "SSH-Schluessel beziehungsweise Token mit Push-Recht auf origin bereitstellen.",
          ],
    );
  }

  const nvmrcPath = path.join(repoRoot, ".nvmrc");
  if (existsSync(nvmrcPath)) {
    const pin = readFileSync(nvmrcPath, "utf8").trim();
    const running = process.version.replace(/^v/, "");
    add(running === pin, "Node entspricht .nvmrc", `Pin ${pin}, laufend ${running}`, [
      "Gepinnte Toolchain in den PATH holen, zum Beispiel:",
      `  export PATH="$HOME/.nvm/versions/node/v${pin}/bin:$PATH"`,
      "Oder in einer interaktiven Shell: nvm use",
    ]);
  }

  // Der Toolchain-Vertrag des Repositories selbst, ohne Dopplung der Pruefregeln.
  const runtimeCheck = path.join(repoRoot, "scripts/check-runtime-versions.mjs");
  if (existsSync(runtimeCheck)) {
    const result = spawnSync(process.execPath, [runtimeCheck, "--toolchain-only"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const firstLine = (result.status === 0 ? result.stdout : result.stderr)
      .trim()
      .split("\n")
      .slice(0, 3)
      .join(" | ");
    add(result.status === 0, "Toolchain-Vertrag des Repositories", firstLine, [
      "Abhilfe nennt die Ausgabe von: npm run check:runtime-versions",
    ]);
  }

  // Der Commit-Pfad: ohne aktiven Hook committen Worker unformatiert, und `format:check`
  // faellt erst in der CI auf.
  const declaredHook = path.join(repoRoot, ".githooks/pre-commit");
  if (existsSync(declaredHook)) {
    const hooksPath = inRepo(["config", "core.hooksPath"], { allowFailure: true }).stdout;
    add(
      hooksPath === ".githooks",
      "Commit-Hook aktiv",
      hooksPath || "core.hooksPath nicht gesetzt",
      ["Hook aktivieren: npm run prepare"],
    );
    const prettier = existsSync(path.join(repoRoot, "node_modules/.bin/prettier"));
    add(
      prettier,
      "Prettier fuer den Hook vorhanden",
      prettier ? "node_modules/.bin/prettier" : "fehlt",
      ["Abhaengigkeiten installieren: npm ci"],
    );
  }

  const branch = currentBranch();
  const dirty = inRepo(["status", "--porcelain", "--untracked-files=no"]).stdout;
  add(
    true,
    "aktueller Branch",
    `${branch}${isProtectedBranch(branch) ? " (geschuetzt; Arbeit gehoert auf einen Feature-Branch)" : ""}`,
  );
  add(
    true,
    "Arbeitsbaum-Zustand",
    dirty === "" ? "clean" : `${dirty.split("\n").length} Datei(en) geaendert`,
  );

  process.stdout.write(
    checks
      .map((check) => `${check.ok ? "OK  " : "FEHL"}  ${check.label}: ${check.detail}\n`)
      .join(""),
  );

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    process.stdout.write("\n");
    abort(`${failed.length} Voraussetzung(en) des Worker-Pfads fehlen.`, [
      ...failed.flatMap((check) => [`${check.label}:`, ...check.nextActions.map((a) => `  ${a}`)]),
    ]);
  }

  process.stdout.write(
    [
      "",
      "Der Worker-Pfad ist ausfuehrbar:",
      "  npm run worker:start -- <praefix>/<issue>-<kurzname>",
      "  npm run check",
      "  npm run worker:sync",
      "  npm run worker:push",
      "  npm run worker:gate",
      "",
    ].join("\n"),
  );
}

const USAGE = [
  "Aufruf: node scripts/worker-git.mjs <befehl> [optionen]",
  "",
  "  doctor                     prueft Checkout, Lese-/Schreibzugriff, Toolchain und Commit-Hook",
  "  start <branch>             legt einen Feature-Branch auf der aktuellen origin/main-Spitze an",
  "  sync [--allow-deletions]   rebased den aktuellen Feature-Branch auf origin/main",
  "  push [--allow-drop]        veroeffentlicht den Branch, Force nur als --force-with-lease",
  "  gate [--allow-deletions]   prueft die lokal pruefbaren Merge-Voraussetzungen, ohne zu aendern",
  "",
].join("\n");

function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "doctor":
      return commandDoctor();
    case "start":
      return commandStart(args);
    case "sync":
      return commandSync(args);
    case "push":
      return commandPush(args);
    case "gate":
      return commandGate(args);
    default:
      process.stderr.write(
        command === undefined || command === "--help" || command === "-h"
          ? USAGE
          : `Unbekannter Befehl: ${command}\n\n${USAGE}`,
      );
      process.exit(command === "--help" || command === "-h" ? 0 : 2);
  }
}

try {
  main();
} catch (error) {
  if (error instanceof Abort) {
    process.stderr.write(`Abbruch: ${error.message}\n`);
    if (error.nextActions.length > 0) {
      process.stderr.write(
        ["", "Naechster Schritt:", ...error.nextActions.map((action) => `  ${action}`), ""].join(
          "\n",
        ),
      );
    }
    process.exit(1);
  }
  throw error;
}
