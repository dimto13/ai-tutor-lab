import assert from "node:assert/strict";
import test from "node:test";
import {
  copilotRuntime,
  createCopilotRuntime,
  type CopilotRuntimeState,
} from "../../src/runtime/copilotRuntime.ts";
import { DEFAULT_COPILOT_PRODUCT_PROFILE } from "../../src/runtime/copilotProductProfile.ts";
import { defineRuntimeAdapterContractTests } from "./runtimeAdapter.contract.ts";

const targetRef = "copilot.chat.modelSelector";
const targetRect = {
  x: 20,
  y: 30,
  top: 30,
  right: 180,
  bottom: 70,
  left: 20,
  width: 160,
  height: 40,
  toJSON: () => ({}),
} as DOMRect;

function createContainer(): HTMLElement {
  const target = { getBoundingClientRect: () => targetRect };
  return {
    querySelector: (selector: string) =>
      selector === `[data-highlight="${targetRef}"]` ? target : null,
  } as unknown as HTMLElement;
}

defineRuntimeAdapterContractTests("copilotRuntime", () => {
  let restoredState: CopilotRuntimeState | null = null;
  let unsubscribeState: (() => void) | null = null;

  return {
    adapter: copilotRuntime,
    reset: () => {
      unsubscribeState?.();
      unsubscribeState = null;
      restoredState = null;
      copilotRuntime.reset();
    },
    target: {
      ref: targetRef,
      container: createContainer(),
      expectedRect: targetRect,
    },
    event: {
      name: "copilot.prompt.submitted",
      emit: () => {
        copilotRuntime.submitPrompt("Explain the active file");
      },
    },
    query: {
      selector: "copilot.model",
      expected: "auto",
    },
    seed: {
      seed: {
        enabled: true,
        mode: "plan",
        modelId: "gpt-5.3-codex",
        contextActiveFile: "src/app.ts",
      },
      selector: "copilot.model",
      expected: "gpt-5.3-codex",
    },
    snapshot: {
      selector: "copilot.mode",
      expectedRestoredValue: "plan",
      prepare: () => {
        copilotRuntime.setMode("plan");
        copilotRuntime.setModel("gpt-5.3-codex");
        copilotRuntime.setContextActiveFile("src/snapshot.ts");
        unsubscribeState = copilotRuntime.subscribeState((state, reason) => {
          if (reason === "restore") restoredState = state;
        });
      },
      mutate: () => {
        copilotRuntime.setMode("agent");
        copilotRuntime.setModel("auto");
        copilotRuntime.setContextActiveFile(null);
      },
      assertRestoredPresentation: () => {
        assert.ok(restoredState);
        assert.equal(restoredState.mode, "plan");
        assert.equal(restoredState.modelId, "gpt-5.3-codex");
        assert.equal(restoredState.contextActiveFile, "src/snapshot.ts");
        unsubscribeState?.();
        unsubscribeState = null;
      },
    },
  };
});

test("copilotRuntime: emits accept and reject events for inline suggestions", async () => {
  const events: string[] = [];
  const unsubscribe = copilotRuntime.subscribe((event) => events.push(event.type));
  await copilotRuntime.mount(createContainer());

  try {
    copilotRuntime.offerInlineSuggestion("src/app.ts", "const answer = 42;");
    assert.equal(copilotRuntime.acceptInlineSuggestion(), "const answer = 42;");

    copilotRuntime.offerInlineSuggestion("src/app.ts", "const rejected = true;");
    copilotRuntime.rejectInlineSuggestion();

    assert.ok(events.includes("ai.suggestion.accepted"));
    assert.ok(events.includes("ai.suggestion.rejected"));
    assert.equal(await copilotRuntime.query("copilot.inline.status"), "rejected");
  } finally {
    unsubscribe();
    await copilotRuntime.unmount();
  }
});

test("copilotRuntime: configured inline suggestions come from runtime seed and guard the source state", async () => {
  const runtime = createCopilotRuntime();
  await runtime.mount(createContainer(), {
    inlineSuggestions: [
      {
        file: "example.py",
        whenContentEquals: "def multiply(a, b):\n",
        text: "    return a * b\n",
      },
    ],
  });

  try {
    assert.equal(runtime.offerConfiguredInlineSuggestion("example.py", "x = 1\n"), null);
    const suggestion = runtime.offerConfiguredInlineSuggestion(
      "example.py",
      "def multiply(a, b):\n",
    );
    assert.equal(suggestion?.text, "    return a * b\n");
    assert.equal(runtime.acceptInlineSuggestion(), "    return a * b\n");
  } finally {
    await runtime.unmount();
  }
});

test("copilotRuntime: configured chat responses come from runtime seed", async () => {
  const runtime = createCopilotRuntime();
  await runtime.mount(createContainer(), {
    chatResponses: [
      {
        file: "example.py",
        promptContains: "multipl",
        response: "def multiply(a, b):\n    return a * b",
      },
    ],
  });

  try {
    runtime.setContextActiveFile("example.py");
    const response = runtime.submitPrompt("Erstelle eine Funktion zum Multiplizieren zweier Zahlen.");
    assert.equal(response, "def multiply(a, b):\n    return a * b");

    const fallback = runtime.submitPrompt("Was macht die aktuell geöffnete Datei?", "x = 1\n");
    assert.match(fallback, /x = 1/);
  } finally {
    await runtime.unmount();
  }
});

test("copilotRuntime: chat response and event carry the opened file context", async () => {
  const payloads: Array<Record<string, unknown>> = [];
  const unsubscribe = copilotRuntime.subscribe((event) => {
    if (event.type === "copilot.prompt.submitted") {
      payloads.push(event.payload as Record<string, unknown>);
    }
  });
  await copilotRuntime.mount(createContainer());

  try {
    copilotRuntime.setContextActiveFile("src/context.ts");
    const response = copilotRuntime.submitPrompt("What does this file do?");
    assert.match(response, /src\/context\.ts/);
    assert.equal(payloads[0]?.["activeFile"], "src/context.ts");
    assert.equal(await copilotRuntime.query("copilot.context.activeFile"), "src/context.ts");
  } finally {
    unsubscribe();
    await copilotRuntime.unmount();
  }
});

test("copilotRuntime: a new conversation clears chat history but preserves working context", async () => {
  await copilotRuntime.mount(createContainer());

  try {
    copilotRuntime.setContextActiveFile("src/context.ts");
    copilotRuntime.setMode("plan");
    copilotRuntime.setModel("gpt-5.3-codex");
    copilotRuntime.submitPrompt("Plan a refactor");
    assert.equal(await copilotRuntime.query("copilot.conversation.messageCount"), 2);

    const previousConversation = await copilotRuntime.query<string>("copilot.conversation.id");
    const nextConversation = copilotRuntime.startConversation();

    assert.notEqual(nextConversation, previousConversation);
    assert.equal(await copilotRuntime.query("copilot.conversation.messageCount"), 0);
    assert.equal(await copilotRuntime.query("copilot.context.activeFile"), "src/context.ts");
    assert.equal(await copilotRuntime.query("copilot.mode"), "plan");
    assert.equal(await copilotRuntime.query("copilot.model"), "gpt-5.3-codex");
  } finally {
    await copilotRuntime.unmount();
  }
});

test("copilotRuntime: customer product profiles can replace version and model options", async () => {
  const customProfile = {
    ...DEFAULT_COPILOT_PRODUCT_PROFILE,
    id: "customer-copilot-vscode-2026-08",
    productVersion: "customer-2026.08",
    defaultModelId: "customer-approved-model",
    models: [
      {
        id: "customer-approved-model",
        label: "Customer Approved Model",
        provider: "Customer",
        selection: "explicit" as const,
      },
    ],
  };
  const runtime = createCopilotRuntime(customProfile);
  await runtime.mount(createContainer());

  try {
    assert.equal(await runtime.query("copilot.profile.id"), "customer-copilot-vscode-2026-08");
    assert.equal(await runtime.query("copilot.product.version"), "customer-2026.08");
    assert.equal(await runtime.query("copilot.model"), "customer-approved-model");
  } finally {
    await runtime.unmount();
  }
});
