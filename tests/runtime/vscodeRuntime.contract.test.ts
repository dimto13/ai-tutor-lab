import { workspaceBus } from "../../src/state/eventBus.ts";
import { vscodeRuntime } from "../../src/runtime/vscodeRuntime.ts";
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

defineRuntimeAdapterContractTests("vscodeRuntime", () => ({
  adapter: vscodeRuntime,
  reset: () => vscodeRuntime.reset(),
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
    prepare: () => vscodeRuntime.setWorkspace("folder", ["ai-training-demo"]),
    mutate: () => vscodeRuntime.setWorkspace("workspace", ["ai-training-demo", "shared-tools"]),
  },
}));
