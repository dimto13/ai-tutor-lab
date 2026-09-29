import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultValidatorRegistry, type ValidationContext } from "../src/validation.ts";
import type {
  RuntimePathComparison,
  TrainingEvent,
  Validation,
  WorkspaceEventName,
} from "../src/types.ts";

const registry = createDefaultValidatorRegistry();

/** Declared by the runtime, exactly as the vscode simulator declares it. */
const declaredPositions = {
  eventKeys: ["filename", "path"],
  selectors: ["filesystem.files", "filesystem.contents", "editor.activeFile"],
} as const;

function event(
  type: WorkspaceEventName,
  payload: Record<string, unknown>,
): TrainingEvent<Record<string, unknown>> {
  return {
    id: type,
    source: "test-runtime",
    type,
    timestamp: "2026-09-27T00:00:00.000Z",
    sessionId: "session-1",
    payload,
  };
}

function context(
  comparison: RuntimePathComparison,
  triggering?: TrainingEvent<Record<string, unknown>>,
): ValidationContext {
  const state: Record<string, unknown> = {
    "editor.activeFile": "NOTIZ.txt",
    "filesystem.files": ["README.md", "NOTIZ.txt"],
    "filesystem.contents": { "NOTIZ.txt": "Hallo Welt" },
    "terminal.lastResult": "OK",
  };
  return {
    ...(triggering ? { event: triggering } : {}),
    query: async (selector) => state[selector],
    pathIdentity: { comparison, ...declaredPositions },
  };
}

const pathValidations: Validation[] = [
  { kind: "state", selector: "editor.activeFile", equals: "notiz.txt" },
  { kind: "state", selector: "filesystem.files", includes: "notiz.txt" },
  { kind: "state", selector: "filesystem.contents", match: { "notiz.txt": "Hallo Welt" } },
];

const createdNotiz: Validation = {
  kind: "event",
  type: "file.created",
  match: { filename: "notiz.txt" },
};

test("case-insensitive profile accepts an equivalent path spelling", async () => {
  const ctx = context("case-insensitive");
  for (const validation of pathValidations) {
    const result = await registry.validate(validation, ctx);
    assert.equal(result.outcome, "pass", JSON.stringify(validation));
  }

  const created = await registry.validate(
    createdNotiz,
    context("case-insensitive", event("file.created", { filename: "NOTIZ.txt" })),
  );
  assert.equal(created.outcome, "pass");
});

test("case-sensitive profile keeps an equivalent path spelling distinct", async () => {
  const ctx = context("case-sensitive");
  for (const validation of pathValidations) {
    const result = await registry.validate(validation, ctx);
    assert.equal(result.outcome, "near-miss", JSON.stringify(validation));
  }

  const created = await registry.validate(
    createdNotiz,
    context("case-sensitive", event("file.created", { filename: "NOTIZ.txt" })),
  );
  assert.equal(created.outcome, "near-miss");
});

test("only the key of a path map folds; the stored content stays exact", async () => {
  const contentCaseDiffers: Validation = {
    kind: "state",
    selector: "filesystem.contents",
    match: { "notiz.txt": "hallo welt" },
  };
  const result = await registry.validate(contentCaseDiffers, context("case-insensitive"));
  assert.equal(result.outcome, "near-miss", "file content must never be case-folded");
});

test("values outside the declared path positions are never folded", async () => {
  const commandValidation: Validation = {
    kind: "event",
    type: "terminal.command.executed",
    match: { command: "git status" },
  };
  const command = await registry.validate(
    commandValidation,
    context("case-insensitive", event("terminal.command.executed", { command: "GIT STATUS" })),
  );
  assert.equal(command.outcome, "near-miss", "a command is not a path");

  const undeclared: Validation = {
    kind: "state",
    selector: "terminal.lastResult",
    equals: "ok",
  };
  const result = await registry.validate(undeclared, context("case-insensitive"));
  assert.equal(result.outcome, "near-miss", "an undeclared selector is not a path");
});

test("without a path identity every comparison stays exact", async () => {
  const activeFile: Validation = {
    kind: "state",
    selector: "editor.activeFile",
    equals: "notiz.txt",
  };
  const result = await registry.validate(activeFile, { query: async () => "NOTIZ.txt" });
  assert.equal(result.outcome, "near-miss");
});

test("a single path string keeps path semantics for a fragment check", async () => {
  const activeFileFragment: Validation = {
    kind: "state",
    selector: "editor.activeFile",
    includes: "notiz",
  };
  assert.equal(
    (await registry.validate(activeFileFragment, context("case-insensitive"))).outcome,
    "pass",
    "a scalar path must fold under the active profile, not only a list of paths",
  );
  assert.equal(
    (await registry.validate(activeFileFragment, context("case-sensitive"))).outcome,
    "near-miss",
    "the case-sensitive profile keeps the fragment check exact",
  );

  const excludesFragment: Validation = {
    kind: "state",
    selector: "editor.activeFile",
    excludes: "notiz",
  };
  assert.equal(
    (await registry.validate(excludesFragment, context("case-insensitive"))).outcome,
    "near-miss",
    "exclusion sees the same identity as inclusion",
  );

  const includesAnyFragment: Validation = {
    kind: "state",
    selector: "editor.activeFile",
    includesAny: ["notiz"],
  };
  assert.equal(
    (await registry.validate(includesAnyFragment, context("case-insensitive"))).outcome,
    "pass",
    "includesAny on a path uses the fixed path locale instead of the free-text folding",
  );
});

test("a path event key keeps path semantics for a fragment check", async () => {
  const containsFilename: Validation = {
    kind: "event",
    type: "file.created",
    contains: { filename: "notiz" },
  };
  assert.equal(
    (
      await registry.validate(
        containsFilename,
        context("case-insensitive", event("file.created", { filename: "NOTIZ.txt" })),
      )
    ).outcome,
    "pass",
  );
  assert.equal(
    (
      await registry.validate(
        containsFilename,
        context("case-sensitive", event("file.created", { filename: "NOTIZ.txt" })),
      )
    ).outcome,
    "near-miss",
  );
});

test("an undeclared payload field stays free text with its own normalization", async () => {
  const promptFragment: Validation = {
    kind: "event",
    type: "ai.prompt.submitted",
    containsAny: { prompt: ["strasse"] },
  };
  const prompt = await registry.validate(
    promptFragment,
    context("case-insensitive", event("ai.prompt.submitted", { prompt: "Zur Straße" })),
  );
  assert.equal(
    prompt.outcome,
    "pass",
    "a prompt is not a path, so the normalizing free-text comparison stays in place",
  );
});
