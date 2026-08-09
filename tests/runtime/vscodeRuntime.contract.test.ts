import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceBus } from "../../src/state/eventBus.ts";
import { vscodeRuntime, type VscodeRuntimeState } from "../../src/runtime/vscodeRuntime.ts";
import { defineRuntimeAdapterContractTests } from "./runtimeAdapter.contract.ts";

const targetRef = "vscode.activityBar.explorer";
const targetRect = {
  x: 12,
  y: 24,
  top: 24,
  right: 132,
  bottom: 64,
  left: 12,
  width: 120,
  height: 40,
  toJSON: () => ({}),
} as DOMRect;

const seededRuntimeState = {
  workspaceMode: "folder",
  folders: ["seeded-project"],
  files: ["seeded.py"],
  contents: { "seeded.py": "print('seeded')\n" },
  openTabs: ["seeded.py"],
  activeFile: "seeded.py",
  activePanel: "terminal",
} as const;

function createContainer(): HTMLElement {
  const target = {
    getBoundingClientRect: () => targetRect,
  };

  return {
    querySelector: (selector: string) =>
      selector === `[data-highlight="${targetRef}"]` ? target : null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLElement;
}

defineRuntimeAdapterContractTests("vscodeRuntime", () => {
  let restoredPresentation: VscodeRuntimeState | null = null;
  let unsubscribeState: (() => void) | null = null;

  return {
    adapter: vscodeRuntime,
    reset: () => {
      unsubscribeState?.();
      unsubscribeState = null;
      restoredPresentation = null;
      vscodeRuntime.reset();
    },
    target: {
      ref: targetRef,
      container: createContainer(),
      expectedRect: targetRect,
    },
    event: {
      name: "explorer.opened",
      emit: () => workspaceBus.emit("explorer.opened"),
    },
    query: {
      selector: "workspace.mode",
      expected: "none",
    },
    seed: {
      seed: seededRuntimeState,
      selector: "editor.activeFile",
      expected: "seeded.py",
    },
    snapshot: {
      selector: "workspace.mode",
      expectedRestoredValue: "folder",
      prepare: () => {
        vscodeRuntime.setWorkspace("folder", ["ai-training-demo"]);
        vscodeRuntime.addFile("snapshot.py");
        vscodeRuntime.setFileContent("snapshot.py", "print('snapshot')\n");
        vscodeRuntime.setActiveFile("snapshot.py");
        vscodeRuntime.setActivePanel("terminal");
        vscodeRuntime.setTerminalLines(["before restore"]);
        vscodeRuntime.setTerminalCommand("git status");
        vscodeRuntime.setStaged(true);
        vscodeRuntime.setWrongFile("wrong.py");
        unsubscribeState = vscodeRuntime.subscribeState((runtimeState, reason) => {
          if (reason === "restore") restoredPresentation = runtimeState;
        });
      },
      mutate: () => {
        vscodeRuntime.saveFile("snapshot.py");
        vscodeRuntime.setWorkspace("workspace", ["ai-training-demo", "shared-tools"]);
        vscodeRuntime.addFile("mutated.py");
        vscodeRuntime.setFileContent("snapshot.py", "print('mutated')\n");
        vscodeRuntime.closeFile("snapshot.py");
        vscodeRuntime.setActivePanel(null);
        vscodeRuntime.setTerminalLines(["after restore"]);
        vscodeRuntime.setTerminalCommand("clear");
        vscodeRuntime.setStaged(false);
        vscodeRuntime.setWrongFile(null);
      },
      assertRestoredPresentation: () => {
        assert.ok(restoredPresentation);
        assert.equal(restoredPresentation.workspaceMode, "folder");
        assert.deepEqual(restoredPresentation.folders, ["ai-training-demo"]);
        assert.deepEqual(restoredPresentation.files, ["README.md", "snapshot.py"]);
        assert.equal(restoredPresentation.contents["snapshot.py"], "print('snapshot')\n");
        assert.deepEqual(restoredPresentation.openTabs, ["snapshot.py"]);
        assert.equal(restoredPresentation.activeFile, "snapshot.py");
        assert.equal(restoredPresentation.activePanel, "terminal");
        assert.deepEqual(restoredPresentation.terminalLines, ["before restore"]);
        assert.equal(restoredPresentation.terminalCommand, "git status");
        assert.equal(restoredPresentation.staged, true);
        assert.deepEqual(restoredPresentation.stagedContents, {
          "snapshot.py": "print('snapshot')\n",
        });
        assert.equal(restoredPresentation.wrongFile, "wrong.py");
        assert.deepEqual(restoredPresentation.dirtyFiles, ["snapshot.py"]);
        unsubscribeState?.();
        unsubscribeState = null;
      },
    },
  };
});

test("vscodeRuntime: publishes the supplied seed to presentation subscribers on mount", async () => {
  const captured: { current: VscodeRuntimeState | null } = { current: null };
  const unsubscribe = vscodeRuntime.subscribeState((runtimeState, reason) => {
    if (reason === "mount") captured.current = runtimeState;
  });

  try {
    vscodeRuntime.reset();
    await vscodeRuntime.mount(createContainer(), seededRuntimeState);
    assert.ok(captured.current);
    assert.equal(captured.current.workspaceMode, "folder");
    assert.deepEqual(captured.current.folders, ["seeded-project"]);
    assert.deepEqual(captured.current.files, ["seeded.py"]);
    assert.equal(captured.current.contents["seeded.py"], "print('seeded')\n");
    assert.deepEqual(captured.current.openTabs, ["seeded.py"]);
    assert.equal(captured.current.activeFile, "seeded.py");
    assert.equal(captured.current.activePanel, "terminal");
    assert.deepEqual(captured.current.terminalLines, []);
    assert.equal(captured.current.staged, false);
    assert.deepEqual(captured.current.dirtyFiles, []);
  } finally {
    unsubscribe();
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: reset preserves the active mount seed", async () => {
  await vscodeRuntime.mount(createContainer(), seededRuntimeState);

  try {
    vscodeRuntime.setWorkspace("workspace", ["mutated-project"]);
    vscodeRuntime.setActiveFile(null);
    vscodeRuntime.setTerminalLines(["mutated"]);
    vscodeRuntime.setStaged(true);

    vscodeRuntime.reset();

    assert.equal(await vscodeRuntime.query("workspace.mode"), "folder");
    assert.equal(await vscodeRuntime.query("editor.activeFile"), "seeded.py");
    assert.deepEqual(await vscodeRuntime.query("terminal.lines"), []);
    assert.equal(await vscodeRuntime.query("scm.staged"), false);
    assert.deepEqual(await vscodeRuntime.query("editor.dirtyFiles"), []);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: save clears dirty state and emits file.saved", async () => {
  const events: string[] = [];
  const unsubscribe = vscodeRuntime.subscribe((event) => events.push(event.type));
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["ai-training-demo"],
  });

  try {
    vscodeRuntime.addFile("challenge.py");
    vscodeRuntime.setFileContent("challenge.py", "# Status für Marco: Review abgeschlossen.");
    vscodeRuntime.setActiveFile("challenge.py");

    assert.deepEqual(await vscodeRuntime.query("editor.dirtyFiles"), ["challenge.py"]);
    assert.deepEqual(await vscodeRuntime.query("filesystem.contents"), {
      "README.md": "# ai-training-demo\n\nDemo-Repository für das AI Training Lab.\n",
      "challenge.py": "# Status für Marco: Review abgeschlossen.",
    });

    vscodeRuntime.saveFile("challenge.py");

    assert.deepEqual(await vscodeRuntime.query("editor.dirtyFiles"), []);
    assert.ok(events.includes("file.saved"));
  } finally {
    unsubscribe();
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: terminal commands use runtime filesystem and Git state", async () => {
  const terminalEvents: Array<Record<string, unknown>> = [];
  const scmEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const unsubscribe = vscodeRuntime.subscribe((event) => {
    if (event.type === "terminal.command.executed") {
      terminalEvents.push(event.payload as Record<string, unknown>);
    }
    if (event.type === "scm.staged" || event.type === "scm.committed") {
      scmEvents.push({ type: event.type, payload: event.payload as Record<string, unknown> });
    }
  });
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["ai-training-demo"],
    files: ["README.md"],
    contents: { "README.md": "# Demo\n" },
  });

  try {
    vscodeRuntime.initializeTerminal();
    vscodeRuntime.addFile("hello.py");
    vscodeRuntime.setFileContent("hello.py", 'print("Hello AI Training")\n');

    const status = vscodeRuntime.executeTerminalCommand("git status");
    assert.equal(status.exitCode, 0);
    assert.match(status.lines.join("\n"), /Untracked files:[\s\S]*hello\.py/);

    const add = vscodeRuntime.executeTerminalCommand("git add hello.py");
    assert.equal(add.exitCode, 0);
    assert.equal(add.staged, true);
    assert.deepEqual(await vscodeRuntime.query("scm.stagedFiles"), ["hello.py"]);

    const commit = vscodeRuntime.executeTerminalCommand('git commit -m "add hello example"');
    assert.equal(commit.exitCode, 0);
    assert.equal(commit.staged, false);
    assert.deepEqual(await vscodeRuntime.query("scm.changedFiles"), []);
    assert.deepEqual(await vscodeRuntime.query("scm.stagedFiles"), []);
    assert.deepEqual(await vscodeRuntime.query("scm.commits"), [
      {
        hash: "0000001",
        message: "add hello example",
        files: ["hello.py"],
      },
    ]);

    const python = vscodeRuntime.executeTerminalCommand("python hello.py");
    assert.equal(python.exitCode, 0);
    assert.match(python.lines.join("\n"), /Hello AI Training/);

    assert.deepEqual(
      terminalEvents.map((event) => event["command"]),
      ["git status", "git add hello.py", 'git commit -m "add hello example"', "python hello.py"],
    );
    assert.equal(terminalEvents[2]?.["staged"], true);
    assert.equal(terminalEvents[2]?.["committed"], true);
    assert.equal(terminalEvents[3]?.["exitCode"], 0);
    assert.deepEqual(scmEvents, [
      {
        type: "scm.staged",
        payload: { files: ["hello.py"], stagedFiles: ["hello.py"] },
      },
      {
        type: "scm.committed",
        payload: { hash: "0000001", message: "add hello example", files: ["hello.py"] },
      },
    ]);
  } finally {
    unsubscribe();
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: migrates snapshots from before terminal Git state was introduced", async () => {
  await vscodeRuntime.mount(createContainer());
  const legacySnapshot = {
    workspaceMode: "folder",
    folders: ["legacy-project"],
    files: ["README.md", "legacy.py"],
    contents: { "README.md": "# Legacy\n", "legacy.py": "print('ok')\n" },
    openTabs: ["legacy.py"],
    activeFile: "legacy.py",
    activePanel: "terminal",
    terminalLines: ["legacy terminal"],
    terminalCommand: "git status",
    staged: true,
    wrongFile: null,
    dirtyFiles: ["legacy.py"],
  };

  try {
    await vscodeRuntime.restore(legacySnapshot);

    assert.equal(await vscodeRuntime.query("terminal.cwd"), "");
    assert.deepEqual(await vscodeRuntime.query("scm.stagedFiles"), ["legacy.py"]);
    assert.deepEqual(await vscodeRuntime.query("scm.changedFiles"), ["legacy.py"]);
    assert.deepEqual(await vscodeRuntime.query("scm.commits"), []);
    const restored = (await vscodeRuntime.snapshot()) as VscodeRuntimeState;
    assert.deepEqual(restored.directories, ["src", "docs"]);
    assert.deepEqual(restored.trackedFiles, ["README.md", "legacy.py"]);
    assert.deepEqual(restored.stagedContents, {
      "legacy.py": "print('ok')\n",
    });
    const status = vscodeRuntime.executeTerminalCommand("git status");
    assert.match(status.lines.join("\n"), /Changes to be committed:[\s\S]*legacy\.py/);
    assert.doesNotMatch(status.lines.join("\n"), /working tree clean/);
    vscodeRuntime.executeTerminalCommand('git commit -m "restore legacy work"');
    assert.deepEqual(await vscodeRuntime.query("scm.commits"), [
      { hash: "0000001", message: "restore legacy work", files: ["legacy.py"] },
    ]);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: clears a tracked change when editor content returns to the committed baseline", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["ai-training-demo"],
    files: ["README.md"],
    contents: { "README.md": "# Original\n" },
  });

  try {
    vscodeRuntime.setFileContent("README.md", "# Changed\n");
    assert.deepEqual(await vscodeRuntime.query("scm.changedFiles"), ["README.md"]);

    vscodeRuntime.setFileContent("README.md", "# Original\n");
    assert.deepEqual(await vscodeRuntime.query("scm.changedFiles"), []);
    const status = vscodeRuntime.executeTerminalCommand("git status");
    assert.match(status.lines.join("\n"), /working tree clean/);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: commits the staged snapshot and retains later editor changes", async () => {
  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["ai-training-demo"],
    files: ["README.md"],
    contents: { "README.md": "first version\n" },
    trackedFiles: ["README.md"],
    scmChangedFiles: ["README.md"],
  });

  try {
    vscodeRuntime.executeTerminalCommand("git add README.md");
    vscodeRuntime.setFileContent("README.md", "first version\nsecond version\n");

    const commit = vscodeRuntime.executeTerminalCommand('git commit -m "save first version"');
    assert.equal(commit.exitCode, 0);
    assert.deepEqual(await vscodeRuntime.query("scm.stagedFiles"), []);
    assert.deepEqual(await vscodeRuntime.query("scm.changedFiles"), ["README.md"]);

    const status = vscodeRuntime.executeTerminalCommand("git status");
    assert.match(status.lines.join("\n"), /Changes not staged[\s\S]*README\.md/);
    assert.doesNotMatch(status.lines.join("\n"), /working tree clean/);
  } finally {
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: failed terminal commands are emitted without mutating simulator state", async () => {
  const terminalEvents: Array<Record<string, unknown>> = [];
  const unsubscribe = vscodeRuntime.subscribe((event) => {
    if (event.type === "terminal.command.executed") {
      terminalEvents.push(event.payload as Record<string, unknown>);
    }
  });
  await vscodeRuntime.mount(createContainer(), seededRuntimeState);

  try {
    const before = await vscodeRuntime.snapshot();
    const failure = vscodeRuntime.executeTerminalCommand("git stats");

    assert.equal(failure.exitCode, 1);
    assert.match(failure.lines.join("\n"), /not a git command/);
    assert.equal(terminalEvents[0]?.["exitCode"], 1);
    assert.match(String(terminalEvents[0]?.["output"]), /not a git command/);

    const after = (await vscodeRuntime.snapshot()) as VscodeRuntimeState;
    const beforeState = before as VscodeRuntimeState;
    assert.deepEqual(after.files, beforeState.files);
    assert.deepEqual(after.contents, beforeState.contents);
    assert.deepEqual(after.stagedFiles, beforeState.stagedFiles);
    assert.deepEqual(after.stagedContents, beforeState.stagedContents);
    assert.deepEqual(after.commits, beforeState.commits);
  } finally {
    unsubscribe();
    await vscodeRuntime.unmount();
  }
});

test("vscodeRuntime: has no Copilot capabilities or state selectors", async () => {
  assert.equal(vscodeRuntime.capabilities.includes("chat" as never), false);
  assert.equal(await vscodeRuntime.query("copilot.model"), undefined);
});

test("vscodeRuntime: never resolves targets from the global document after unmount", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const globalTarget = { getBoundingClientRect: () => targetRect };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelector: () => globalTarget,
    },
  });

  try {
    vscodeRuntime.reset();
    await vscodeRuntime.mount(createContainer());
    await vscodeRuntime.unmount();
    assert.equal(vscodeRuntime.resolveTarget(targetRef), null);
  } finally {
    if (originalDocument) {
      Object.defineProperty(globalThis, "document", originalDocument);
    } else {
      delete (globalThis as typeof globalThis & { document?: Document }).document;
    }
  }
});
