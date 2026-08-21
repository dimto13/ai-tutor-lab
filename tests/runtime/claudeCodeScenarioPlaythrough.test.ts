import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDefaultValidatorRegistry,
  type EngineValidationResult,
  type TrainingEvent,
  type Validation,
} from "@ai-train-lab/training-engine";
import exploreRaw from "../../content/scenarios/claude-code-basics.explore.json" with { type: "json" };
import guidedRaw from "../../content/scenarios/claude-code-basics.guided.json" with { type: "json" };
import challengeRaw from "../../content/scenarios/claude-code-basics.challenge.json" with { type: "json" };
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";
import {
  createClaudeCodeRuntime,
  type ClaudeCodeRuntimeAdapter,
} from "../../apps/web/src/runtime/claudeCodeRuntime.ts";
import { CLAUDE_CODE_DEFINITION } from "../../apps/web/src/runtime/claudeCodeDefinition.ts";

/**
 * End-to-end generizität proof for #126: authored scenarios are loaded by the
 * production content loader and validated by the unchanged training engine
 * against the existing Claude Code RuntimeAdapter. No engine registration or
 * host-shell integration is involved.
 */

function createContainer(): HTMLElement {
  return { querySelector: () => null } as unknown as HTMLElement;
}

const registry = createDefaultValidatorRegistry();

/** Mirrors how the engine feeds runtime events into a step validation. */
async function evaluateStep(
  validation: Validation,
  events: readonly TrainingEvent[],
  query: (selector: string) => Promise<unknown>,
): Promise<EngineValidationResult> {
  let fallback: EngineValidationResult = await registry.validate(validation, { query });
  for (const event of events) {
    const result = await registry.validate(validation, { event, events: [event], query });
    if (result.outcome === "pass") return result;
    if (result.outcome === "near-miss") fallback = result;
  }
  return fallback;
}

type StepAction = (runtime: ClaudeCodeRuntimeAdapter) => void;

const guidedStepActions: Record<string, StepAction> = {
  "start-agent-session": (runtime) => runtime.startSession(),
  "list-workspace-files": (runtime) => runtime.runCommand("ls"),
  "ask-agent-for-change": (runtime) =>
    runtime.submitPrompt("Ergänze in README.md einen Abschnitt mit den ersten Schritten"),
  "review-sensitive-plan": (runtime) => runtime.reviewPlan(),
  "inspect-sensitive-diff": (runtime) => runtime.openProposedChange(),
  "reject-sensitive-change": (runtime) => runtime.rejectPendingChange(),
  "refocus-agent": (runtime) =>
    runtime.submitPrompt("Korrigiere den Vorschlag sicher ohne Geheimnisse und schließe config aus"),
  "review-corrected-plan": (runtime) => runtime.reviewPlan(),
  "inspect-corrected-diff": (runtime) => runtime.openProposedChange(),
  "approve-corrected-change": (runtime) => runtime.approvePendingChange(),
  "run-verification-test": (runtime) => runtime.runCommand("npm test"),
  "verify-final-result": (runtime) => runtime.verifyResult(),
};

async function mountGuidedRuntime(): Promise<{
  runtime: ClaudeCodeRuntimeAdapter;
  drain: () => TrainingEvent[];
  dispose: () => Promise<void>;
}> {
  const scenario = parseScenario(guidedRaw);
  const runtime = createClaudeCodeRuntime();
  let buffer: TrainingEvent[] = [];
  const unsubscribe = runtime.subscribe((event) => buffer.push(event));
  await runtime.mount(createContainer(), scenario.environment?.seed);
  return {
    runtime,
    drain: () => {
      const events = buffer;
      buffer = [];
      return events;
    },
    dispose: async () => {
      unsubscribe();
      await runtime.unmount();
    },
  };
}

test("claude-code basics: Explore, Guided and Challenge load through production content", () => {
  const explore = parseScenario(exploreRaw);
  const guided = parseScenario(guidedRaw);
  const challenge = parseScenario(challengeRaw);

  assert.equal(explore.mode, "explore");
  assert.equal(guided.mode, "guided");
  assert.equal(challenge.mode, "challenge");
  for (const scenario of [explore, guided, challenge]) {
    assert.equal(scenario.environment?.productId, "claude-code");
    assert.equal(scenario.environment?.runtimeAdapterId, "claude-code-cli-simulator");
    assert.equal(scenario.environment?.integrations, undefined);
  }

  assert.ok(explore.exploreTargets?.length);
  const runtimeTargets = new Set(CLAUDE_CODE_DEFINITION.surface.map(({ ref }) => ref));
  for (const target of explore.exploreTargets ?? []) {
    assert.ok(runtimeTargets.has(target), `unknown Explore target ${target}`);
  }
  assert.ok(challenge.completionValidation, "Challenge needs end-state validation");
});

test("claude-code Guided: no step depends on explore-only inspection events", () => {
  const scenario = parseScenario(guidedRaw);
  const eventTypes: string[] = [];
  const collect = (validation: Validation | undefined): void => {
    if (!validation) return;
    if (validation.kind === "event") eventTypes.push(validation.type);
    if (validation.kind === "all" || validation.kind === "any" || validation.kind === "sequence") {
      validation.of.forEach(collect);
    }
    if (validation.kind === "not") collect(validation.of);
  };
  scenario.steps.forEach((step) => collect(step.validation));

  assert.ok(eventTypes.length > 0);
  assert.equal(eventTypes.includes("ui.element.inspected"), false);
});

test("claude-code Guided: every step validates against the unchanged engine", async () => {
  const scenario = parseScenario(guidedRaw);
  const { runtime, drain, dispose } = await mountGuidedRuntime();

  try {
    for (const step of scenario.steps) {
      const action = guidedStepActions[step.id];
      assert.ok(action, `no learner action mapped for step ${step.id}`);

      drain();
      action(runtime);
      const result = await evaluateStep(step.validation as Validation, drain(), (selector) =>
        runtime.query(selector),
      );

      assert.equal(
        result.outcome,
        "pass",
        `step ${step.id} did not pass: ${result.outcome}${
          result.message ? ` – ${result.message}` : ""
        }`,
      );
    }

    const contents = await runtime.query<Record<string, string>>("claude.files.contents");
    assert.match(contents["README.md"] ?? "", /## Erste Schritte/);
    assert.doesNotMatch(contents["README.md"] ?? "", /DEMO_TOKEN/);
    assert.deepEqual(await runtime.query("claude.changes.rejected"), ["readme-draft-sensitive"]);
    assert.deepEqual(await runtime.query("claude.changes.applied"), ["readme-corrected"]);
    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), []);
    assert.equal(await runtime.query("claude.tests.lastPassed"), true);
    assert.equal(await runtime.query("claude.verification.passed"), true);
  } finally {
    await dispose();
  }
});

test("claude-code Guided: approving the sensitive proposal fails the intended safety decision", async () => {
  const scenario = parseScenario(guidedRaw);
  const rejectionStep = scenario.steps.find((step) => step.id === "reject-sensitive-change");
  assert.ok(rejectionStep?.validation);

  const { runtime, drain, dispose } = await mountGuidedRuntime();
  try {
    runtime.submitPrompt("Ergänze in README.md einen Abschnitt mit den ersten Schritten");
    runtime.openProposedChange();
    drain();

    runtime.approvePendingChange();
    const result = await evaluateStep(rejectionStep.validation as Validation, drain(), (selector) =>
      runtime.query(selector),
    );

    assert.notEqual(result.outcome, "pass");
    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), [
      "readme-draft-sensitive",
    ]);
  } finally {
    await dispose();
  }
});

test("claude-code Challenge: safe result passes without a prescribed prompt or review sequence", async () => {
  const scenario = parseScenario(challengeRaw);
  assert.ok(scenario.completionValidation);
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), scenario.environment?.seed);

  try {
    // Deliberately use a minimal valid path: the Challenge must score outcome,
    // test evidence and safety decisions rather than Guided's click sequence.
    runtime.rejectPendingChange();
    runtime.submitPrompt("Bitte Status sicher aus docs/status übernehmen, ohne Geheimnisse");
    runtime.approvePendingChange();
    runtime.runCommand("npm test");
    runtime.verifyResult();

    const result = await registry.validate(scenario.completionValidation, {
      query: (selector) => runtime.query(selector),
    });
    assert.equal(result.outcome, "pass");
    assert.deepEqual(await runtime.query("claude.changes.rejected"), ["unsafe-status-export"]);
    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), []);
  } finally {
    await runtime.unmount();
  }
});

test("claude-code Challenge: unsafe approval cannot be repaired into a passing completion", async () => {
  const scenario = parseScenario(challengeRaw);
  assert.ok(scenario.completionValidation);
  const runtime = createClaudeCodeRuntime();
  await runtime.mount(createContainer(), scenario.environment?.seed);

  try {
    runtime.approvePendingChange();
    runtime.submitPrompt("Bitte Status sicher aus docs/status übernehmen, ohne Geheimnisse");
    runtime.approvePendingChange();
    runtime.runCommand("npm test");
    runtime.verifyResult();

    const result = await registry.validate(scenario.completionValidation, {
      query: (selector) => runtime.query(selector),
    });
    assert.notEqual(result.outcome, "pass");
    assert.deepEqual(await runtime.query("claude.security.unsafeApprovals"), [
      "unsafe-status-export",
    ]);
    assert.equal(await runtime.query("claude.verification.passed"), false);
  } finally {
    await runtime.unmount();
  }
});
