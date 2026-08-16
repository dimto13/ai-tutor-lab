import { vscodeRuntime as simulatorRuntime } from "@ai-train-lab/runtime-vscode-sim";
import type { RuntimeAdapter } from "@ai-train-lab/runtime-core";

export * from "@ai-train-lab/runtime-vscode-sim";

/**
 * Web composition adapter for VS Code. Product-specific recovery commands stay
 * here; training-engine and runtime-core only see the semantic command envelope.
 */
export const vscodeRuntime = {
  ...simulatorRuntime,

  subscribeStateChange(handler) {
    return simulatorRuntime.subscribeState((_state, reason) => handler({ reason }));
  },

  async recover(command) {
    if (command.type !== "editor.activate-file") return { status: "unsupported" as const };
    const filename = command.payload?.["filename"];
    if (typeof filename !== "string" || !filename.trim()) {
      return { status: "unsupported" as const };
    }

    const files = await simulatorRuntime.query<string[]>("filesystem.files");
    if (!files.includes(filename)) return { status: "unsupported" as const };

    simulatorRuntime.setActiveFile(filename);
    // Reuse the normal restore signal so the rendered workspace fully mirrors
    // the repaired runtime state instead of requiring product logic in React.
    await simulatorRuntime.restore(await simulatorRuntime.snapshot());
    return { status: "repaired" as const };
  },
} satisfies RuntimeAdapter & typeof simulatorRuntime;
