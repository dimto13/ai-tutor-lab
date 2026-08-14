import assert from "node:assert/strict";
import { test } from "node:test";
import { copilotRuntime, createCopilotRuntime } from "../../apps/web/src/runtime/copilotRuntime.ts";
import { getRuntimeAdapter } from "../../apps/web/src/runtime/index.ts";

function createContainer(): HTMLElement {
  return {
    querySelector: () => null,
  } as unknown as HTMLElement;
}

test("Copilot chat visibility is event-driven and snapshot-restorable", async () => {
  const runtime = createCopilotRuntime();
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => events.push(event.type));

  try {
    await runtime.mount(createContainer());
    assert.equal(await runtime.query("copilot.chat.open"), false);

    runtime.setChatOpen(true);
    assert.equal(await runtime.query("copilot.chat.open"), true);
    assert.deepEqual(events, ["copilot.chat.opened"]);

    const snapshot = await runtime.snapshot();
    runtime.setChatOpen(false);
    assert.equal(await runtime.query("copilot.chat.open"), false);

    await runtime.restore(snapshot);
    assert.equal(await runtime.query("copilot.chat.open"), true);
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});

test("disabling Copilot closes chat without disabling the host runtime contract", async () => {
  const runtime = createCopilotRuntime();
  await runtime.mount(createContainer());

  try {
    runtime.setChatOpen(true);
    runtime.setEnabled(false);

    assert.equal(await runtime.query("copilot.enabled"), false);
    assert.equal(await runtime.query("copilot.chat.open"), false);
    assert.throws(() => runtime.setChatOpen(true), /disabled/);
  } finally {
    await runtime.unmount();
  }
});

test("Copilot file explanations are derived from the content supplied for the active file", async () => {
  const runtime = createCopilotRuntime();
  await runtime.mount(createContainer());

  try {
    runtime.setContextActiveFile("calculator.py");

    const incompleteResponse = runtime.submitPrompt(
      "Was macht die aktuell geöffnete Datei?",
      "def add(a, b):\n",
    );
    assert.match(incompleteResponse, /def add\(a, b\):/);
    assert.match(incompleteResponse, /noch keinen Funktionskörper/);

    const changedResponse = runtime.submitPrompt(
      "Was macht die aktuell geöffnete Datei?",
      "def add(a, b):\n    return a - b\n",
    );
    assert.match(changedResponse, /return a - b/);
    assert.doesNotMatch(changedResponse, /noch keinen Funktionskörper/);
  } finally {
    await runtime.unmount();
  }
});

test("registered Copilot runtime preserves prompt-time context across later attachment changes", async () => {
  const runtime = getRuntimeAdapter("github-copilot-vscode-simulator");
  assert.ok(runtime);
  const unsubscribe = runtime.subscribe(() => undefined);
  await runtime.mount(createContainer());

  try {
    copilotRuntime.setContextActiveFile("notes.txt");
    copilotRuntime.submitPrompt("Bitte add implementieren.");
    copilotRuntime.setContextActiveFile("calculator.py");

    assert.equal(await runtime.query("copilot.prompt.contextFile"), "notes.txt");

    const snapshot = await runtime.snapshot();
    copilotRuntime.setContextActiveFile("calculator.py");
    copilotRuntime.submitPrompt("Addition für calculator.py");
    assert.equal(await runtime.query("copilot.prompt.contextFile"), "calculator.py");

    await runtime.restore(snapshot);
    assert.equal(await runtime.query("copilot.prompt.contextFile"), "notes.txt");
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});
