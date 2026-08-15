import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claudeCodeRuntime,
  createClaudeCodeRuntime,
  type ClaudeCodeState,
} from "../../apps/web/src/runtime/claudeCodeRuntime.ts";
import { CLAUDE_CODE_DEFINITION } from "../../apps/web/src/runtime/claudeCodeDefinition.ts";
import { defineRuntimeAdapterContractTests } from "./runtimeAdapter.contract.ts";

const targetRef = "claude.transcript";
const targetRect = {
  x: 8,
  y: 16,
  top: 16,
  right: 488,
  bottom: 336,
  left: 8,
  width: 480,
  height: 320,
  toJSON: () => ({}),
} as DOMRect;

function createContainer(): HTMLElement {
  const target = { getBoundingClientRect: () => targetRect };
  return {
    querySelector: (selector: string) =>
      selector === `[data-highlight="${targetRef}"]` ? target : null,
  } as unknown as HTMLElement;
}

const readmeProposal = {
  id: "readme-update",
  path: "README.md",
  label: "Installationsabschnitt ergänzen",
  promptMatch: ["installation"],
  planSteps: ["README.md lesen", "Abschnitt Installation ergänzen"],
  nextContent: "# Projekt\n\n## Installation\n\nnpm install\n",
};

defineRuntimeAdapterContractTests("claudeCodeRuntime", () => {
  let restoredState: ClaudeCodeState | null = null;
  let unsubscribeState: (() => void) | null = null;

  return {
    adapter: claudeCodeRuntime,
    reset: () => {
      unsubscribeState?.();
      unsubscribeState = null;
      restoredState = null;
      claudeCodeRuntime.reset();
    },
    target: {
      ref: targetRef,
      container: createContainer(),
      expectedRect: targetRect,
    },
    event: {
      name: "terminal.command.executed",
      emit: () => claudeCodeRuntime.runCommand("ls"),
    },
    query: {
      selector: "claude.changes.applied",
      expected: [],
    },
    seed: {
      seed: {
        claudeCode: {
          cwd: "/srv/api",
          model: "claude-sonnet-5",
          files: { "README.md": "# Projekt\n" },
        },
      },
      selector: "claude.cwd",
      expected: "/srv/api",
    },
    snapshot: {
      selector: "claude.pendingChange.id",
      expectedRestoredValue: "readme-update",
      prepare: () => {
        claudeCodeRuntime.proposeChange(readmeProposal);
        unsubscribeState = claudeCodeRuntime.subscribeState((state, reason) => {
          if (reason === "restore") restoredState = state;
        });
      },
      mutate: () => claudeCodeRuntime.approvePendingChange(),
      assertRestoredPresentation: () => {
        assert.ok(restoredState);
        assert.equal(restoredState.pendingProposalId, "readme-update");
        assert.deepEqual(restoredState.appliedProposalIds, []);
        unsubscribeState?.();
        unsubscribeState = null;
      },
    },
  };
});

test("claudeCodeRuntime: is a standalone product runtime, not a host integration", () => {
  assert.equal(claudeCodeRuntime.productId, "claude-code");
  assert.equal("hostProductId" in CLAUDE_CODE_DEFINITION, false);
  assert.deepEqual([...claudeCodeRuntime.capabilities], ["terminal", "chat", "agent_mode"]);
});

test("claudeCodeRuntime: drives a prompt-to-approval flow on canonical events only", async () => {
  const runtime = createClaudeCodeRuntime();
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => events.push(event.type));
  await runtime.mount(createContainer(), {
    claudeCode: {
      cwd: "/srv/api",
      files: { "README.md": "# Projekt\n" },
      proposals: [readmeProposal],
    },
  });

  try {
    runtime.startSession();
    assert.equal(await runtime.query("claude.session.active"), true);

    runtime.runCommand("ls");
    assert.deepEqual(await runtime.query("claude.commands.executed"), ["ls"]);

    runtime.submitPrompt("Ergänze die Installation in der README");
    assert.equal(await runtime.query("claude.pendingChange.id"), "readme-update");
    assert.equal(await runtime.query("claude.pendingChange.path"), "README.md");
    assert.deepEqual(await runtime.query("claude.plan.steps"), readmeProposal.planSteps);

    runtime.approvePendingChange();
    assert.equal(await runtime.query("claude.pendingChange.id"), null);
    assert.deepEqual(await runtime.query("claude.changes.applied"), ["readme-update"]);
    assert.match(
      (await runtime.query<Record<string, string>>("claude.files.contents"))["README.md"] ?? "",
      /npm install/,
    );

    assert.deepEqual(events, [
      "terminal.opened",
      "terminal.command.executed",
      "ai.prompt.submitted",
      "ai.suggestion.shown",
      "ai.suggestion.accepted",
      "file.updated",
    ]);
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: a rejected change leaves the workspace untouched", async () => {
  const runtime = createClaudeCodeRuntime();
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => events.push(event.type));
  await runtime.mount(createContainer(), {
    claudeCode: { files: { "README.md": "# Projekt\n" }, proposals: [readmeProposal] },
  });

  try {
    runtime.submitPrompt("Bitte die Installation ergänzen");
    runtime.rejectPendingChange();

    assert.equal(await runtime.query("claude.pendingChange.id"), null);
    assert.deepEqual(await runtime.query("claude.changes.rejected"), ["readme-update"]);
    assert.deepEqual(await runtime.query("claude.changes.applied"), []);
    assert.deepEqual(await runtime.query("claude.files.contents"), { "README.md": "# Projekt\n" });
    assert.ok(events.includes("ai.suggestion.rejected"));
    assert.equal(events.includes("file.updated"), false);
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: routes prompts to the matching proposal and reports unmatched prompts", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: {
      proposals: [
        readmeProposal,
        {
          id: "changelog-update",
          path: "CHANGELOG.md",
          label: "Changelog ergänzen",
          promptMatch: ["changelog"],
          nextContent: "## 1.1.0\n",
        },
      ],
    },
  });

  try {
    runtime.submitPrompt("Pflege den Changelog");
    assert.equal(await runtime.query("claude.pendingChange.id"), "changelog-update");
    runtime.approvePendingChange();

    runtime.submitPrompt("Und jetzt die Installation dokumentieren");
    assert.equal(await runtime.query("claude.pendingChange.id"), "readme-update");
    runtime.approvePendingChange();

    runtime.submitPrompt("Deploy nach Produktion");
    assert.equal(await runtime.query("claude.pendingChange.id"), null);
    assert.equal(await runtime.query("claude.prompt.last"), "Deploy nach Produktion");
    assert.deepEqual(await runtime.query("claude.changes.applied"), [
      "changelog-update",
      "readme-update",
    ]);
  } finally {
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: reset returns to the state the scenario mounted with", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: { files: { "README.md": "# Projekt\n" }, proposals: [readmeProposal] },
  });

  try {
    runtime.startSession();
    runtime.submitPrompt("Installation ergänzen");
    runtime.approvePendingChange();
    assert.deepEqual(await runtime.query("claude.changes.applied"), ["readme-update"]);

    runtime.reset();
    assert.equal(await runtime.query("claude.session.active"), false);
    assert.deepEqual(await runtime.query("claude.changes.applied"), []);
    assert.deepEqual(await runtime.query("claude.files.contents"), { "README.md": "# Projekt\n" });
    assert.deepEqual(await runtime.query("claude.transcript.entries"), []);
  } finally {
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: rejects a foreign snapshot instead of restoring a broken state", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer());
  try {
    await assert.rejects(() => runtime.restore({ viewMode: "preview" }), /Invalid claude code/);
  } finally {
    await runtime.unmount();
  }
});
