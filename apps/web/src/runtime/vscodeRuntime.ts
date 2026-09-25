import { vscodeRuntime as simulatorRuntime } from "@ai-train-lab/runtime-vscode-sim";
import { matchesRuntimePath, type RuntimeAdapter } from "@ai-train-lab/runtime-core";

export * from "@ai-train-lab/runtime-vscode-sim";

let mountedContainer: HTMLElement | null = null;

const vscodeEnvironment = {
  pathComparison: "case-insensitive",
} as const;

function resolveVisibleTransientActionRegions(): DOMRect[] {
  if (!mountedContainer) return [];
  return Array.from(
    mountedContainer.querySelectorAll<HTMLElement>('[role="menu"], [role="dialog"]'),
  )
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

/**
 * Web composition adapter for VS Code. Product-specific recovery commands and
 * knowledge about transient VS Code surfaces stay here; training-engine,
 * runtime-core and platform overlays only see product-neutral adapter contracts.
 */
export const vscodeRuntime = {
  ...simulatorRuntime,
  environment: vscodeEnvironment,

  async mount(container, seed) {
    mountedContainer = container;
    try {
      await simulatorRuntime.mount(container, seed);
    } catch (error) {
      mountedContainer = null;
      throw error;
    }
  },

  async unmount() {
    mountedContainer = null;
    await simulatorRuntime.unmount();
  },

  subscribeStateChange(handler) {
    return simulatorRuntime.subscribeState((_state, reason) => handler({ reason }));
  },

  resolveTransientActionRegions(): readonly DOMRect[] {
    return resolveVisibleTransientActionRegions();
  },

  async recover(command) {
    if (command.type !== "editor.activate-file") return { status: "unsupported" as const };
    const filename = command.payload?.["filename"];
    if (typeof filename !== "string" || !filename.trim()) {
      return { status: "unsupported" as const };
    }

    const files = await simulatorRuntime.query<string[]>("filesystem.files");
    const canonicalFilename = files.find((file) =>
      matchesRuntimePath(file, filename, vscodeEnvironment),
    );
    if (!canonicalFilename) return { status: "unsupported" as const };

    simulatorRuntime.setActiveFile(canonicalFilename);
    // Reuse the normal restore signal so the rendered workspace fully mirrors
    // the repaired runtime state instead of requiring product logic in React.
    await simulatorRuntime.restore(await simulatorRuntime.snapshot());
    return { status: "repaired" as const };
  },
} satisfies RuntimeAdapter & typeof simulatorRuntime;
