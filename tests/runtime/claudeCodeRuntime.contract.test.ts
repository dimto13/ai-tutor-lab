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

const safeProposal = {
  id: "safe-update",
  path: "README.md",
  label: "Status sicher ergänzen",
  promptMatch: ["sicher"],
  planSteps: ["README.md lesen", "freigegebenen Status ergänzen"],
  nextContent: "# Projekt\n\n## Status\n\nbereit\n",
  safety: "safe" as const,
};

const unsafeProposal = {
  id: "unsafe-update",
  path: "README.md",
  label: "Geheimnis veröffentlichen",
  promptMatch: ["token"],
  planSteps: [".env.example lesen", "Token in README kopieren"],
  nextContent: "# Projekt\n\nDEMO_TOKEN=TRAINING-ONLY-SECRET\n",
  safety: "sensitive" as const,
  safetyReason: "Token gehört nicht in README.md",
};

const statusCheck = {
  id: "status-test",
  command: "npm test",
  path: "README.md",
  includes: ["## Status", "bereit"],
  excludes: ["DEMO_TOKEN"],
  passingOutput: "1 Test bestanden",
  failingOutput: "1 Test fehlgeschlagen",
};

const documentationCheck = {
  id: "documentation-test",
  command: "npm test:docs",
  path: "README.md",
  includes: ["# Projekt", "## Status"],
  excludes: ["DEMO_TOKEN"],
  passingOutput: "Dokumentation geprüft",
  failingOutput: "Dokumentationsprüfung fehlgeschlagen",
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

test("claudeCodeRuntime: plan review, stop and refocus are explicit deterministic controls", async () => {
  const runtime = createClaudeCodeRuntime();
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => events.push(event.type));
  await runtime.mount(createContainer(), {
    claudeCode: { files: { "README.md": "# Projekt\n" }, proposals: [safeProposal] },
  });

  try {
    runtime.submitPrompt("Bitte sicher aktualisieren");
    assert.equal(await runtime.query("claude.task.status"), "running");
    assert.equal(await runtime.query("claude.plan.reviewed"), false);

    runtime.reviewPlan();
    assert.equal(await runtime.query("claude.plan.reviewed"), true);

    runtime.stopTask();
    assert.equal(await runtime.query("claude.task.status"), "stopped");
    assert.equal(await runtime.query("claude.task.stoppedCount"), 1);
    assert.equal(await runtime.query("claude.pendingChange.id"), null);

    runtime.submitPrompt("Bitte sicher aktualisieren");
    assert.equal(await runtime.query("claude.pendingChange.id"), "safe-update");
    assert.equal(await runtime.query("claude.task.status"), "running");
    assert.ok(events.includes("ai.plan.reviewed"));
    assert.ok(events.includes("ai.task.stopped"));
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: deterministic test output reflects synthetic file state only", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: {
      files: { "README.md": "# Projekt\n" },
      proposals: [safeProposal],
      checks: [statusCheck],
    },
  });

  try {
    runtime.runCommand("npm test");
    assert.equal(await runtime.query("claude.tests.lastPassed"), false);

    runtime.submitPrompt("Bitte sicher aktualisieren");
    runtime.approvePendingChange();
    runtime.runCommand("npm test");

    assert.equal(await runtime.query("claude.tests.lastPassed"), true);
    const runs =
      await runtime.query<Array<{ passed: boolean; output: string }>>("claude.tests.runs");
    assert.deepEqual(
      runs.map(({ passed, output }) => ({ passed, output })),
      [
        { passed: false, output: "1 Test fehlgeschlagen" },
        { passed: true, output: "1 Test bestanden" },
      ],
    );
  } finally {
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: command whitespace and CRLF content are normalized deterministically", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: {
      files: { "README.md": "# Projekt\r\n\r\n## Status\r\n\r\nbereit\r\n" },
      checks: [statusCheck],
    },
  });

  try {
    runtime.runCommand("  npm   test  ");
    assert.equal(await runtime.query("claude.tests.lastPassed"), true);
    assert.deepEqual(await runtime.query("claude.commands.executed"), ["npm   test"]);
  } finally {
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: rejecting unsafe work then verifying safe work succeeds", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: {
      files: { "README.md": "# Projekt\n", ".env.example": "DEMO_TOKEN=TRAINING-ONLY-SECRET\n" },
      proposals: [unsafeProposal, safeProposal],
      initialProposalId: "unsafe-update",
      checks: [statusCheck],
    },
  });

  try {
    assert.equal(await runtime.query("claude.pendingChange.safety"), "sensitive");
    runtime.rejectPendingChange();
    assert.deepEqual(await runtime.query("claude.changes.rejected"), ["unsafe-update"]);

    runtime.submitPrompt("Bitte sicher aktualisieren");
    runtime.approvePendingChange();
    runtime.runCommand("npm test");

    assert.equal(runtime.verifyResult(), true);
    assert.equal(await runtime.query("claude.verification.passed"), true);
    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), []);
    assert.doesNotMatch(
      (await runtime.query<Record<string, string>>("claude.files.contents"))["README.md"] ?? "",
      /DEMO_TOKEN/,
    );
  } finally {
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: an unsafe approval remains a permanent verification failure", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: {
      files: { "README.md": "# Projekt\n" },
      proposals: [unsafeProposal, safeProposal],
      initialProposalId: "unsafe-update",
      checks: [statusCheck],
    },
  });

  try {
    runtime.approvePendingChange();
    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), ["unsafe-update"]);

    runtime.submitPrompt("Bitte sicher aktualisieren");
    runtime.approvePendingChange();
    runtime.runCommand("npm test");
    assert.equal(await runtime.query("claude.tests.lastPassed"), true);

    assert.equal(runtime.verifyResult(), false);
    assert.equal(await runtime.query("claude.verification.passed"), false);
  } finally {
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: re-proposing an id cannot erase a prior unsafe approval", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: {
      files: { "README.md": "# Projekt\n" },
      proposals: [unsafeProposal],
      initialProposalId: "unsafe-update",
    },
  });

  try {
    runtime.approvePendingChange();
    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), ["unsafe-update"]);

    runtime.proposeChange({
      ...unsafeProposal,
      safety: "safe",
      safetyReason: undefined,
      nextContent: "# Projekt\n\nSicherer Folgeentwurf\n",
    });

    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), ["unsafe-update"]);
  } finally {
    await runtime.unmount();
  }
});

test("claudeCodeRuntime: verification requires the latest passing run for every configured check", async () => {
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), {
    claudeCode: {
      files: { "README.md": "# Projekt\n" },
      proposals: [safeProposal],
      checks: [statusCheck, documentationCheck],
    },
  });

  try {
    runtime.submitPrompt("Bitte sicher aktualisieren");
    runtime.approvePendingChange();

    runtime.runCommand("npm test");
    assert.equal(runtime.verifyResult(), false);

    runtime.runCommand("npm test:docs");
    assert.equal(runtime.verifyResult(), true);
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
    assert.equal(await runtime.query("claude.verification.passed"), null);
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
