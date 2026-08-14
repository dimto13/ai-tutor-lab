import assert from "node:assert/strict";
import test from "node:test";
import { vscodeRuntime } from "../src/index.ts";

function createContainer(): HTMLElement {
  return {
    querySelector: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLElement;
}

function command(...parts: string[]): string {
  return parts.join(" ");
}

test("verification result survives unrelated source-control actions", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["demo"],
    files: ["check.py"],
    contents: { "check.py": 'print("ok")\n' },
  });

  try {
    const verificationCommand = command("python", "check.py");
    const verification = vscodeRuntime.executeTerminalCommand(verificationCommand);
    assert.equal(verification.exitCode, 0);

    const expected = {
      command: verificationCommand,
      exitCode: 0,
      ok: true,
      branch: "main",
      output: "ok",
      target: "check.py",
      content: 'print("ok")\n',
      saved: true,
    };
    assert.deepEqual(await vscodeRuntime.query("verification.lastResult"), expected);

    vscodeRuntime.executeTerminalCommand(command("git", "status"));

    assert.deepEqual(await vscodeRuntime.query("verification.lastResult"), expected);
    assert.notDeepEqual(await vscodeRuntime.query("terminal.lastResult"), expected);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("verification becomes stale when the tested file changes", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["demo"],
    files: ["check.py"],
    contents: { "check.py": 'print("old")\n' },
  });

  try {
    vscodeRuntime.executeTerminalCommand(command("python", "check.py"));
    assert.notEqual(await vscodeRuntime.query("verification.lastResult"), null);

    vscodeRuntime.setFileContent("check.py", 'print("new")\n');

    assert.equal(await vscodeRuntime.query("verification.lastResult"), null);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("bare python does not count as file verification", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["demo"],
    files: ["check.py"],
    contents: { "check.py": 'print("ok")\n' },
  });

  try {
    vscodeRuntime.executeTerminalCommand("python");
    assert.equal(await vscodeRuntime.query("verification.lastResult"), null);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("last commit can be reset without losing working-tree changes", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["demo"],
    files: ["calculator.py", "notes.txt"],
    contents: {
      "calculator.py": "def add(a, b):\n    return a + b\n",
      "notes.txt": "local draft\n",
    },
    committedContents: {
      "calculator.py": "# TODO\n",
      "notes.txt": "local note\n",
    },
    trackedFiles: ["calculator.py", "notes.txt"],
    scmChangedFiles: ["calculator.py", "notes.txt"],
    branch: "feature/addition",
  });

  try {
    assert.equal(vscodeRuntime.executeTerminalCommand(command("git", "add", ".")).exitCode, 0);
    assert.equal(
      vscodeRuntime.executeTerminalCommand(command("git", "commit", "-m", '"wrong scope"'))
        .exitCode,
      0,
    );
    assert.equal((await vscodeRuntime.query<Array<unknown>>("scm.commits")).length, 1);
    assert.deepEqual(await vscodeRuntime.query("scm.changedFiles"), []);

    const reset = vscodeRuntime.executeTerminalCommand(command("git", "reset", "HEAD~1"));
    assert.equal(reset.exitCode, 0);
    assert.equal((await vscodeRuntime.query<Array<unknown>>("scm.commits")).length, 0);
    assert.deepEqual(await vscodeRuntime.query("scm.stagedFiles"), []);
    assert.deepEqual(await vscodeRuntime.query("scm.changedFiles"), ["calculator.py", "notes.txt"]);

    const snapshot = (await vscodeRuntime.snapshot()) as {
      committedContents: Record<string, string>;
      contents: Record<string, string>;
    };
    assert.equal(snapshot.committedContents["calculator.py"], "# TODO\n");
    assert.equal(snapshot.committedContents["notes.txt"], "local note\n");
    assert.equal(snapshot.contents["calculator.py"], "def add(a, b):\n    return a + b\n");
    assert.equal(snapshot.contents["notes.txt"], "local draft\n");
  } finally {
    await vscodeRuntime.unmount();
  }
});
