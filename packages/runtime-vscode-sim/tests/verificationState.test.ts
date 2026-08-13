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

test("verification result survives later source-control actions", async () => {
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
    };
    assert.deepEqual(await vscodeRuntime.query("verification.lastResult"), expected);

    vscodeRuntime.executeTerminalCommand(command("git", "status"));

    assert.deepEqual(await vscodeRuntime.query("verification.lastResult"), expected);
    assert.notDeepEqual(await vscodeRuntime.query("terminal.lastResult"), expected);
  } finally {
    await vscodeRuntime.unmount();
  }
});
