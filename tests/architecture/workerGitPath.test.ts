import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Der bewachte Worker-Git-Pfad wird gegen ein echtes Git-Remote geprueft, nicht gegen Mocks:
// die Zusagen des Werkzeugs sind Rebase-, Lease- und Loeschverhalten, und genau das ist nur
// mit echten Refs beobachtbar. Jeder Test arbeitet auf einem eigenen Bare-Remote im
// Temporaerverzeichnis; das Repository selbst wird dabei nicht angefasst.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(root, "scripts/worker-git.mjs");

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "Worker Test",
  GIT_AUTHOR_EMAIL: "worker@example.invalid",
  GIT_COMMITTER_NAME: "Worker Test",
  GIT_COMMITTER_EMAIL: "worker@example.invalid",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv }).trim();
}

function hasLocalBranch(cwd: string, branch: string): boolean {
  return (
    spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd,
      encoding: "utf8",
      env: gitEnv,
    }).status === 0
  );
}

function worker(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: gitEnv,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

type Fixture = { dir: string; remote: string; work: string; helper: string };

function createFixture(): Fixture {
  const dir = mkdtempSync(path.join(os.tmpdir(), "worker-git-"));
  const remote = path.join(dir, "remote.git");
  const work = path.join(dir, "work");
  const helper = path.join(dir, "helper");

  execFileSync("git", ["init", "--bare", "--initial-branch=main", remote], { env: gitEnv });
  execFileSync("git", ["init", "--initial-branch=main", work], { env: gitEnv });
  git(work, "remote", "add", "origin", remote);

  mkdirSync(path.join(work, "tests"), { recursive: true });
  writeFileSync(path.join(work, "tests/guard.test.ts"), "// bereits erledigter Guard\n");
  writeFileSync(path.join(work, "README.md"), "Basis\n");
  writeFileSync(path.join(work, ".nvmrc"), `${process.version.replace(/^v/, "")}\n`);
  git(work, "add", ".");
  git(work, "commit", "-m", "Basis");
  git(work, "push", "origin", "main");
  git(work, "push", "origin", "main:deploy");

  execFileSync("git", ["clone", remote, helper], { env: gitEnv });
  return { dir, remote, work, helper };
}

function withFixture(body: (fixture: Fixture) => void) {
  const fixture = createFixture();
  try {
    body(fixture);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
}

// Bewegt `main` auf dem Remote, wie es ein anderer Merge tun wuerde.
function advanceMain(fixture: Fixture, file: string) {
  git(fixture.helper, "switch", "main");
  git(fixture.helper, "pull", "--ff-only", "origin", "main");
  writeFileSync(path.join(fixture.helper, file), `${file}\n`);
  git(fixture.helper, "add", ".");
  git(fixture.helper, "commit", "-m", `main: ${file}`);
  git(fixture.helper, "push", "origin", "main");
}

function commit(cwd: string, file: string, content: string) {
  writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", `work: ${file}`);
}

test("doctor bestaetigt einen vollstaendig ausfuehrbaren Pfad", () => {
  withFixture((fixture) => {
    const result = worker(fixture.work, "doctor");
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /OK {4}Lesezugriff auf origin/);
    assert.match(result.stdout, /OK {4}Schreibzugriff auf origin/);
    assert.match(result.stdout, /Der Worker-Pfad ist ausfuehrbar/);
    // Der Schreibtest darf keinen Ref zuruecklassen.
    assert.equal(git(fixture.work, "ls-remote", "origin", "refs/heads/worker-git-write-probe"), "");
  });
});

test("doctor nennt eine abweichende Node-Version mit dem konkreten PATH-Schritt", () => {
  withFixture((fixture) => {
    writeFileSync(path.join(fixture.work, ".nvmrc"), "0.0.0\n");
    git(fixture.work, "add", ".");
    git(fixture.work, "commit", "-m", "Pin abweichend");

    const result = worker(fixture.work, "doctor");
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /FEHL {2}Node entspricht \.nvmrc/);
    assert.match(result.stderr, /nvm\/versions\/node\/v0\.0\.0\/bin/);
  });
});

test("sync und push verweigern die geschuetzten Refs main und deploy", () => {
  withFixture((fixture) => {
    for (const branch of ["main", "deploy"]) {
      if (hasLocalBranch(fixture.work, branch)) {
        git(fixture.work, "switch", branch);
      } else {
        git(fixture.work, "switch", "--create", branch, "--no-track", `origin/${branch}`);
      }
      for (const command of ["sync", "push"]) {
        const result = worker(fixture.work, command);
        assert.equal(result.status, 1, `${command} auf ${branch}: ${result.output}`);
        assert.match(result.stderr, /geschuetzter Ref/);
      }
      git(fixture.work, "switch", "--detach", "HEAD");
    }
  });
});

test("sync verweigert einen detached HEAD", () => {
  withFixture((fixture) => {
    git(fixture.work, "switch", "--detach", "HEAD");
    const result = worker(fixture.work, "sync");
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /detached/);
  });
});

test("start legt einen Feature-Branch auf der aktuellen main-Spitze an", () => {
  withFixture((fixture) => {
    advanceMain(fixture, "neu-auf-main.md");

    const rejected = worker(fixture.work, "start", "main");
    assert.equal(rejected.status, 1, rejected.output);

    const withoutPrefix = worker(fixture.work, "start", "feature");
    assert.equal(withoutPrefix.status, 1, withoutPrefix.output);
    assert.match(withoutPrefix.stderr, /Praefix/);

    const created = worker(fixture.work, "start", "chat1/1-erste-aufgabe");
    assert.equal(created.status, 0, created.output);
    assert.equal(git(fixture.work, "rev-parse", "--abbrev-ref", "HEAD"), "chat1/1-erste-aufgabe");
    assert.equal(
      git(fixture.work, "rev-parse", "HEAD"),
      git(fixture.work, "rev-parse", "refs/remotes/origin/main"),
    );

    // Ein bereits existierender Branch wird nicht stillschweigend neu aufgesetzt.
    git(fixture.work, "switch", "--detach", "HEAD");
    const again = worker(fixture.work, "start", "chat1/1-erste-aufgabe");
    assert.equal(again.status, 1, again.output);
    assert.match(again.stderr, /existiert bereits/);
  });
});

test("start nimmt begonnene Arbeit von einem geschuetzten Ref mit", () => {
  withFixture((fixture) => {
    // Genau der Fall, in dem ein Worker bemerkt, dass er noch auf main sitzt.
    writeFileSync(path.join(fixture.work, "README.md"), "Begonnene Arbeit\n");

    const created = worker(fixture.work, "start", "chat1/9-rettung");
    assert.equal(created.status, 0, created.output);
    assert.match(created.stdout, /mitgenommen: 1 nicht eingecheckte Datei/);
    assert.equal(git(fixture.work, "rev-parse", "--abbrev-ref", "HEAD"), "chat1/9-rettung");
    assert.equal(
      readFileSync(path.join(fixture.work, "README.md"), "utf8"),
      "Begonnene Arbeit\n",
      "die begonnene Arbeit muss erhalten bleiben",
    );
  });
});

test("sync rebased den Feature-Branch auf die bewegte main-Spitze", () => {
  withFixture((fixture) => {
    assert.equal(worker(fixture.work, "start", "chat1/2-rebase").status, 0);
    commit(fixture.work, "feature.md", "Feature\n");
    advanceMain(fixture, "fremder-merge.md");

    const result = worker(fixture.work, "sync");
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /ist auf origin\/main rebasiert/);
    assert.equal(git(fixture.work, "rev-list", "--count", "HEAD..origin/main"), "0");
    assert.equal(git(fixture.work, "rev-list", "--count", "origin/main..HEAD"), "1");
    // Der fremde Merge-Stand ist im Branch enthalten, die eigene Arbeit liegt darauf.
    assert.match(git(fixture.work, "log", "-1", "--format=%s"), /work: feature\.md/);
    assert.ok(git(fixture.work, "log", "--format=%s").includes("main: fremder-merge.md"));
  });
});

test("sync blockiert das Verschwinden geschuetzter Dateien und laesst es quittieren", () => {
  withFixture((fixture) => {
    assert.equal(worker(fixture.work, "start", "chat1/3-loeschung").status, 0);
    git(fixture.work, "rm", "--quiet", "tests/guard.test.ts");
    git(fixture.work, "commit", "-m", "work: Guard entfernt");
    advanceMain(fixture, "fremder-merge.md");

    const blocked = worker(fixture.work, "sync");
    assert.equal(blocked.status, 1, blocked.output);
    assert.match(blocked.stderr, /fehlt: tests\/guard\.test\.ts/);

    const acknowledged = worker(fixture.work, "sync", "--allow-deletions");
    assert.equal(acknowledged.status, 0, acknowledged.output);
    assert.match(acknowledged.stdout, /quittiert/);
  });
});

test("push veroeffentlicht neu und aktualisiert rebasiert nur per Lease", () => {
  withFixture((fixture) => {
    assert.equal(worker(fixture.work, "start", "chat1/4-push").status, 0);
    commit(fixture.work, "feature.md", "Feature\n");

    const first = worker(fixture.work, "push");
    assert.equal(first.status, 0, first.output);
    assert.equal(
      git(fixture.work, "ls-remote", "origin", "refs/heads/chat1/4-push").split(/\s+/)[0],
      git(fixture.work, "rev-parse", "HEAD"),
    );

    const again = worker(fixture.work, "push");
    assert.equal(again.status, 0, again.output);
    assert.match(again.stdout, /nichts zu pushen/);

    // Nach einem Rebase ist der Push kein Fast-Forward mehr.
    advanceMain(fixture, "fremder-merge.md");
    assert.equal(worker(fixture.work, "sync").status, 0);
    const forced = worker(fixture.work, "push");
    assert.equal(forced.status, 0, forced.output);
    assert.equal(
      git(fixture.work, "ls-remote", "origin", "refs/heads/chat1/4-push").split(/\s+/)[0],
      git(fixture.work, "rev-parse", "HEAD"),
    );
  });
});

test("push verweigert das Verwerfen fremder Commits auf demselben Branch", () => {
  withFixture((fixture) => {
    assert.equal(worker(fixture.work, "start", "chat1/5-fremd").status, 0);
    commit(fixture.work, "feature.md", "Feature\n");
    assert.equal(worker(fixture.work, "push").status, 0);

    // Ein zweiter Worker pusht auf denselben Branch.
    git(fixture.helper, "fetch", "origin", "chat1/5-fremd");
    git(
      fixture.helper,
      "switch",
      "--create",
      "chat1/5-fremd",
      "--no-track",
      "origin/chat1/5-fremd",
    );
    commit(fixture.helper, "fremd.md", "Fremde Arbeit\n");
    git(fixture.helper, "push", "origin", "chat1/5-fremd");

    commit(fixture.work, "weiter.md", "Weiter\n");
    const blocked = worker(fixture.work, "push");
    assert.equal(blocked.status, 1, blocked.output);
    assert.match(blocked.stderr, /Force-Push wuerde sie verwerfen/);
    assert.match(blocked.stderr, /work: fremd\.md/);
    // Der fremde Stand steht unveraendert auf dem Remote.
    assert.equal(
      git(fixture.work, "ls-remote", "origin", "refs/heads/chat1/5-fremd").split(/\s+/)[0],
      git(fixture.helper, "rev-parse", "HEAD"),
    );

    const acknowledged = worker(fixture.work, "push", "--allow-drop");
    assert.equal(acknowledged.status, 0, acknowledged.output);
    assert.equal(
      git(fixture.work, "ls-remote", "origin", "refs/heads/chat1/5-fremd").split(/\s+/)[0],
      git(fixture.work, "rev-parse", "HEAD"),
    );
  });
});

test("sync und push verweigern einen verschmutzten Arbeitsbaum", () => {
  withFixture((fixture) => {
    assert.equal(worker(fixture.work, "start", "chat1/6-dirty").status, 0);
    commit(fixture.work, "feature.md", "Feature\n");
    writeFileSync(path.join(fixture.work, "feature.md"), "Ungeprueft\n");

    for (const command of ["sync", "push"]) {
      const result = worker(fixture.work, command);
      assert.equal(result.status, 1, `${command}: ${result.output}`);
      assert.match(result.stderr, /nicht eingecheckte Aenderungen/);
    }
  });
});

test("ein unterbrochener Rebase wird nicht uebergangen", () => {
  withFixture((fixture) => {
    assert.equal(worker(fixture.work, "start", "chat1/7-konflikt").status, 0);
    commit(fixture.work, "README.md", "Feature-Fassung\n");

    git(fixture.helper, "switch", "main");
    git(fixture.helper, "pull", "--ff-only", "origin", "main");
    writeFileSync(path.join(fixture.helper, "README.md"), "Main-Fassung\n");
    git(fixture.helper, "add", ".");
    git(fixture.helper, "commit", "-m", "main: README");
    git(fixture.helper, "push", "origin", "main");

    const conflicted = worker(fixture.work, "sync");
    assert.equal(conflicted.status, 1, conflicted.output);
    assert.match(conflicted.stderr, /Konflikte/);
    assert.match(conflicted.stderr, /git rebase --abort/);

    // Solange der Rebase laeuft, pusht der Pfad nichts.
    const blocked = worker(fixture.work, "push");
    assert.equal(blocked.status, 1, blocked.output);
    assert.match(blocked.stderr, /Rebase laeuft noch/);

    git(fixture.work, "rebase", "--abort");
  });
});

test("gate nennt die fehlenden Merge-Voraussetzungen und bestaetigt den erfuellten Stand", () => {
  withFixture((fixture) => {
    assert.equal(worker(fixture.work, "start", "chat1/8-gate").status, 0);
    commit(fixture.work, "feature.md", "Feature\n");
    advanceMain(fixture, "fremder-merge.md");

    const failing = worker(fixture.work, "gate");
    assert.equal(failing.status, 1, failing.output);
    assert.match(failing.stdout, /FEHL {2}behind_by == 0/);
    assert.match(failing.stdout, /FEHL {2}Remote-Head entspricht dem lokalen Head/);
    // Das Gate sagt ausdruecklich, was es nicht beweist.
    assert.match(failing.stdout, /Exact-Head-CI/);

    assert.equal(worker(fixture.work, "sync").status, 0);
    assert.equal(worker(fixture.work, "push").status, 0);

    const passing = worker(fixture.work, "gate");
    assert.equal(passing.status, 0, passing.output);
    assert.doesNotMatch(passing.stdout, /FEHL/);
  });
});

test("der Pfad kennt kein blindes force", () => {
  const source = readFileSync(cli, "utf8");
  assert.ok(!source.includes('"--force"'), "der Pfad darf kein blindes --force uebergeben");
  assert.ok(!source.includes("'--force'"), "der Pfad darf kein blindes --force uebergeben");
  assert.ok(source.includes("--force-with-lease="), "der Push muss einen expliziten Lease setzen");
});
