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
        assert.equal(restoredPresentation.wrongFile, "wrong.py");
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
  } finally {
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
