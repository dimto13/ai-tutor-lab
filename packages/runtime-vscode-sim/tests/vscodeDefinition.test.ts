import assert from "node:assert/strict";
import test from "node:test";
import {
  VSCODE_RUNTIME_DEFINITION,
  vscodeRuntime,
  type TerminalLastResult,
} from "../src/index.ts";
import { vscodeRuntime as baseVscodeRuntime } from "../src/vscodeRuntime.ts";

function createContainer(): HTMLElement {
  return {
    querySelector: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLElement;
}

test("VS Code simulator publishes a semantic runtime definition", () => {
  const surfaceRefs = new Set<string>(VSCODE_RUNTIME_DEFINITION.surface.map((item) => item.ref));

  assert.equal(VSCODE_RUNTIME_DEFINITION.id, "vscode-simulator");
  assert.ok(surfaceRefs.has("vscode.activityBar.explorer"));
  assert.ok(surfaceRefs.has("vscode.primarySideBar"));
  assert.ok(surfaceRefs.has("vscode.secondarySideBar"));
  assert.ok(surfaceRefs.has("vscode.sideBar"));
  assert.ok(surfaceRefs.has("vscode.menu.terminal"));
  assert.ok(!surfaceRefs.has("vscode.statusBar.terminal"));
  assert.ok(VSCODE_RUNTIME_DEFINITION.querySelectors.includes("scm.branch"));
  assert.ok(VSCODE_RUNTIME_DEFINITION.querySelectors.includes("terminal.lastResult"));
});

test("VS Code workflow state persists branch and last terminal result", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["ai-training-demo"],
    files: ["check.py"],
    contents: { "check.py": 'print("tests passed")\n' },
    branch: "main",
  });

  try {
    const switchBranch = vscodeRuntime.executeTerminalCommand("git switch -c feature/workflow");
    assert.equal(switchBranch.exitCode, 0);
    assert.equal(await vscodeRuntime.query("scm.branch"), "feature/workflow");

    const status = vscodeRuntime.executeTerminalCommand("git status");
    assert.match(status.lines.join("\n"), /On branch feature\/workflow/);

    const check = vscodeRuntime.executeTerminalCommand("python check.py");
    assert.equal(check.exitCode, 0);
    assert.deepEqual(await vscodeRuntime.query<TerminalLastResult>("terminal.lastResult"), {
      command: "python check.py",
      exitCode: 0,
      ok: true,
      branch: "feature/workflow",
    });

    const snapshot = await vscodeRuntime.snapshot();
    vscodeRuntime.executeTerminalCommand("git switch -c scratch/other");
    assert.equal(await vscodeRuntime.query("scm.branch"), "scratch/other");

    await vscodeRuntime.restore(snapshot);
    assert.equal(await vscodeRuntime.query("scm.branch"), "feature/workflow");
    assert.deepEqual(await vscodeRuntime.query("terminal.lastResult"), {
      command: "python check.py",
      exitCode: 0,
      ok: true,
      branch: "feature/workflow",
    });
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("VS Code workflow reset returns to the mounted branch seed", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["ai-training-demo"],
    branch: "feature/seed",
  });

  try {
    vscodeRuntime.executeTerminalCommand("git switch -c scratch/reset");
    assert.equal(await vscodeRuntime.query("scm.branch"), "scratch/reset");
    assert.notEqual(await vscodeRuntime.query("terminal.lastResult"), null);

    vscodeRuntime.reset();

    assert.equal(await vscodeRuntime.query("scm.branch"), "feature/seed");
    assert.equal(await vscodeRuntime.query("terminal.lastResult"), null);
    const status = vscodeRuntime.executeTerminalCommand("git status");
    assert.match(status.lines.join("\n"), /On branch feature\/seed/);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("VS Code workflow restores legacy base snapshots as main branch state", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["legacy-project"],
  });

  try {
    const legacySnapshot = await baseVscodeRuntime.snapshot();
    vscodeRuntime.executeTerminalCommand("git switch -c feature/new-state");
    assert.equal(await vscodeRuntime.query("scm.branch"), "feature/new-state");

    await vscodeRuntime.restore(legacySnapshot);

    assert.equal(await vscodeRuntime.query("scm.branch"), "main");
    assert.equal(await vscodeRuntime.query("terminal.lastResult"), null);
    const status = vscodeRuntime.executeTerminalCommand("git status");
    assert.match(status.lines.join("\n"), /On branch main/);
  } finally {
    await vscodeRuntime.unmount();
  }
});
