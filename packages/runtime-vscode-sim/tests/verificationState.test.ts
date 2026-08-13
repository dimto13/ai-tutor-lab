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
