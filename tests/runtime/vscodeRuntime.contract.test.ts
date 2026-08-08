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
    snapshot: {
      selector: "workspace.mode",
      expectedRestoredValue: "folder",
      prepare: () => {
        vscodeRuntime.setWorkspace("folder", ["ai-training-demo"]);
        vscodeRuntime.addFile("snapshot.py");
        vscodeRuntime.setFileContent("snapshot.py", "print('snapshot')\n");
        vscodeRuntime.setActiveFile("snapshot.py");
        vscodeRuntime.setActivePanel("terminal");
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
        unsubscribeState?.();
        unsubscribeState = null;
      },
    },
  };
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
