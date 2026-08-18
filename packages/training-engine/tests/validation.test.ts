import assert from "node:assert/strict";
import test from "node:test";
import { ValidatorRegistry, createDefaultValidatorRegistry } from "../src/validation.ts";
import type { TrainingEvent, Validation, WorkspaceEventName } from "../src/types.ts";

function event(
  type: WorkspaceEventName,
  payload: Record<string, unknown> = {},
  id: string = type,
): TrainingEvent<Record<string, unknown>> {
  return {
    id,
    source: "test-runtime",
    type,
    timestamp: "2026-08-10T00:00:00.000Z",
    sessionId: "session-1",
    payload,
  };
}

test("event validator distinguishes pass, near-miss and irrelevant events", async () => {
  const registry = createDefaultValidatorRegistry();
  const validation: Validation = {
    kind: "event",
    type: "file.created",
    match: { filename: "hello.py" },
  };

  assert.equal(
    (
      await registry.validate(validation, {
        event: event("file.created", { filename: "hello.py" }),
      })
    ).outcome,
    "pass",
  );
  assert.equal(
    (await registry.validate(validation, { event: event("file.created", { filename: "helo.py" }) }))
      .outcome,
    "near-miss",
  );
  assert.equal(
    (await registry.validate(validation, { event: event("editor.selection.changed") })).outcome,
    "ignore",
  );
});

test("event content near-miss preserves guided feedback message", async () => {
  const registry = createDefaultValidatorRegistry();
  const validation: Validation = {
    kind: "event",
    type: "copilot.prompt.submitted",
    containsAny: { context: ["README.md", "src/app.ts"] },
  };

  const result = await registry.validate(validation, {
    event: event("copilot.prompt.submitted", { context: "none" }),
  });

  assert.equal(result.outcome, "near-miss");
  assert.equal(result.message, "Die Aktion wurde erkannt, der erwartete Inhalt fehlt noch.");
});

test("state validator queries runtime state declaratively", async () => {
  const registry = createDefaultValidatorRegistry();
  const validation: Validation = {
    kind: "state",
    selector: "filesystem.files",
    includes: "hello.py",
  };

  assert.equal(
    (await registry.validate(validation, { query: async () => ["README.md", "hello.py"] })).outcome,
    "pass",
  );
  assert.equal(
    (await registry.validate(validation, { query: async () => ["README.md"] })).outcome,
    "near-miss",
  );
});

test("classification validator checks semantic end state and names a missed indicator", async () => {
  const registry = createDefaultValidatorRegistry();
  const validation: Validation = {
    kind: "classification",
    selector: "classification.validation.state",
    documentId: "support-ticket",
    expectedIndicatorIds: ["personal_data"],
    expectedLevelId: "confidential",
    expectedAiDecisions: {
      "m365-copilot-tenant": true,
      "public-ai-chat": false,
      "github-copilot": false,
    },
  };
  const baseState = {
    viewedDocumentIds: ["support-ticket"],
    scheme: {
      levels: [
        { id: "public", label: "Öffentlich", rank: 0 },
        { id: "internal", label: "Intern", rank: 10 },
        { id: "confidential", label: "Vertraulich", rank: 20 },
      ],
      indicators: [{ id: "personal_data", label: "Personenbezogene Daten" }],
    },
    documentProgress: {
      "support-ticket": {
        markedIndicatorIds: [],
        selectedLevelId: "confidential",
        aiDecisions: {
          "m365-copilot-tenant": true,
          "public-ai-chat": false,
          "github-copilot": false,
        },
      },
    },
  };

  const missed = await registry.validate(validation, { query: async () => baseState });
  assert.equal(missed.outcome, "near-miss");
  assert.match(missed.message ?? "", /Personenbezogene Daten/);
  assert.match(missed.message ?? "", /übersehen/);

  const passed = await registry.validate(validation, {
    query: async () => ({
      ...baseState,
      documentProgress: {
        "support-ticket": {
          ...baseState.documentProgress["support-ticket"],
          markedIndicatorIds: ["personal_data"],
        },
      },
    }),
  });
  assert.equal(passed.outcome, "pass");
});

test("classification validator explains the explicit uncertainty escalation rule", async () => {
  const registry = createDefaultValidatorRegistry();
  const validation: Validation = {
    kind: "classification",
    selector: "classification.validation.state",
    documentId: "boundary-ambiguous-ticket",
    expectedIndicatorIds: ["personal_data"],
    expectedLevelId: "strictly_confidential",
    uncertaintyEscalationFromLevelId: "confidential",
    expectedAiDecisions: {
      "m365-copilot-tenant": false,
      "public-ai-chat": false,
      "github-copilot": false,
    },
  };
  const state = {
    viewedDocumentIds: ["boundary-ambiguous-ticket"],
    scheme: {
      levels: [
        { id: "confidential", label: "Vertraulich", rank: 20 },
        { id: "strictly_confidential", label: "Streng vertraulich", rank: 30 },
      ],
      indicators: [{ id: "personal_data", label: "Personenbezogene Daten" }],
    },
    documentProgress: {
      "boundary-ambiguous-ticket": {
        markedIndicatorIds: ["personal_data"],
        selectedLevelId: "confidential",
        aiDecisions: {
          "m365-copilot-tenant": false,
          "public-ai-chat": false,
          "github-copilot": false,
        },
      },
    },
  };

  const result = await registry.validate(validation, { query: async () => state });
  assert.equal(result.outcome, "near-miss");
  assert.match(result.message ?? "", /Im Zweifel höher einstufen/);
  assert.match(result.message ?? "", /Streng vertraulich/);
});

test("not validator inverts relevant declarative conditions and preserves ignore", async () => {
  const registry = createDefaultValidatorRegistry();
  const validation: Validation = {
    kind: "not",
    of: { kind: "state", selector: "editor.dirtyFiles", includes: "calculator.py" },
  };

  assert.equal(
    (await registry.validate(validation, { query: async () => ["notes.txt"] })).outcome,
    "pass",
  );
  assert.equal(
    (await registry.validate(validation, { query: async () => ["calculator.py"] })).outcome,
    "near-miss",
  );
  assert.equal((await registry.validate(validation)).outcome, "ignore");
});

test("sequence validator supports ordered event chains", async () => {
  const registry = createDefaultValidatorRegistry();
  const validation: Validation = {
    kind: "sequence",
    ordered: true,
    of: [
      { kind: "event", type: "explorer.opened" },
      { kind: "event", type: "file.created", match: { filename: "hello.py" } },
    ],
  };

  const ordered = [
    event("explorer.opened", {}, "1"),
    event("file.created", { filename: "hello.py" }, "2"),
  ];
  const reversed = [...ordered].reverse();

  assert.equal((await registry.validate(validation, { events: ordered })).outcome, "pass");
  assert.notEqual((await registry.validate(validation, { events: reversed })).outcome, "pass");
});

test("all and any compose validators without state-machine coupling", async () => {
  const registry = createDefaultValidatorRegistry();
  const context = {
    event: event("file.created", { filename: "hello.py" }),
    query: async () => ["README.md", "hello.py"],
  };
  const all: Validation = {
    kind: "all",
    of: [
      { kind: "event", type: "file.created", match: { filename: "hello.py" } },
      { kind: "state", selector: "filesystem.files", includes: "hello.py" },
    ],
  };
  const any: Validation = {
    kind: "any",
    of: [
      { kind: "event", type: "terminal.opened" },
      { kind: "event", type: "file.created", match: { filename: "hello.py" } },
    ],
  };

  assert.equal((await registry.validate(all, context)).outcome, "pass");
  assert.equal((await registry.validate(any, context)).outcome, "pass");
});

test("new validator kinds can be registered without changing the state machine", async () => {
  const registry = new ValidatorRegistry().register("always", async () => ({ outcome: "pass" }));

  assert.equal((await registry.validate({ kind: "always" })).outcome, "pass");
});
