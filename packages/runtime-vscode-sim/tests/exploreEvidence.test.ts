import assert from "node:assert/strict";
import test from "node:test";
import type { TrainingEvent } from "@ai-train-lab/training-engine";
import { vscodeRuntime } from "../src/index.ts";

function createContainer(): HTMLElement {
  return {
    querySelector: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLElement;
}

function inspectedRefs(events: TrainingEvent[]): string[] {
  return events.flatMap((event) => {
    if (event.type !== "ui.element.inspected") return [];
    if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return [];
    const ref = (event.payload as Record<string, unknown>)["ref"];
    return typeof ref === "string" ? [ref] : [];
  });
}

test("Explore evidence comes from semantic VS Code actions, not mount, restore, or progress-only clicks", async () => {
  const events: TrainingEvent[] = [];
  const unsubscribe = vscodeRuntime.subscribe((event) => events.push(event));

  await vscodeRuntime.mount(createContainer(), {
    workspaceMode: "folder",
    folders: ["seeded-demo"],
    files: ["README.md"],
    contents: { "README.md": "# seeded\n" },
    activeFile: "README.md",
    activePanel: "terminal",
  });

  try {
    assert.deepEqual(inspectedRefs(events), [], "rendered seed state must not count as exploration");

    for (const ref of [
      "vscode.primarySideBar",
      "vscode.workspace.context",
      "vscode.editor",
      "vscode.panel.terminal",
      "vscode.statusBar",
    ]) {
      vscodeRuntime.inspect(ref);
    }
    assert.deepEqual(
      inspectedRefs(events),
      [],
      "semantic targets must not be completable by artificial direct inspection",
    );

    vscodeRuntime.setWorkspace("folder", ["demo"]);
    assert.deepEqual(inspectedRefs(events), [
      "vscode.primarySideBar",
      "vscode.workspace.context",
      "vscode.statusBar",
    ]);

    events.length = 0;
    vscodeRuntime.setActiveFile("README.md");
    vscodeRuntime.setActivePanel("terminal");
    vscodeRuntime.setActivePanel("problems");
    vscodeRuntime.setActivePanel("output");
    assert.deepEqual(inspectedRefs(events), [
      "vscode.editor",
      "vscode.panel.terminal",
      "vscode.panel.problems",
      "vscode.panel.output",
    ]);

    const snapshot = await vscodeRuntime.snapshot();
    events.length = 0;
    await vscodeRuntime.restore(snapshot);
    assert.deepEqual(inspectedRefs(events), [], "restoring visible state must not auto-complete targets");
  } finally {
    unsubscribe();
    await vscodeRuntime.unmount();
  }
});
