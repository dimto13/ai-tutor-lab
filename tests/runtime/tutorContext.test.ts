import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";
import { buildTutorContext } from "../../apps/web/src/tutor/llm/tutorContext.ts";

async function loadScenario(id: string) {
  const raw = await readFile(path.resolve("content/scenarios", `${id}.json`), "utf8");
  return parseScenario(JSON.parse(raw));
}

test("guided tutor context prefers the step targets and knows the runtime catalog", async () => {
  const scenario = await loadScenario("vscode-basics.guided");
  const context = buildTutorContext(scenario, "guided", "create_file");

  assert.equal(context.step?.id, "create_file");
  assert.equal(context.scenarioDescription, scenario.description);
  const authoredStep = scenario.steps.find((candidate) => candidate.id === "create_file");
  assert.ok(authoredStep);
  assert.deepEqual(
    context.step?.helpLevels,
    authoredStep.helpLevels
      .map((hint) => hint.trim())
      .filter((hint) => hint && hint !== "__highlight__"),
  );
  assert.equal(context.step?.possibleFailure, authoredStep.onFailure?.message ?? null);
  assert.deepEqual(context.stepUiTargetRefs, ["vscode.explorer.newFile", "vscode.explorer.tree"]);
  assert.deepEqual(context.allowedUiTargetRefs.slice(0, 2), context.stepUiTargetRefs);
  // #476: a question about the terminal outside the current step can still point at it.
  assert.ok(context.allowedUiTargetRefs.includes("vscode.panel.terminal"));
  assert.equal(context.uiTargetLabels?.["vscode.panel.terminal"], "Terminal");
});

test("explore tutor context adds the explore targets and falls back to the step's why", async () => {
  const scenario = await loadScenario("browser-automation-workflow.explore");
  const step = scenario.steps.find((candidate) => candidate.id === "explore-browser-agent");
  assert.ok(step?.why && !step.rationale);

  const context = buildTutorContext(scenario, "explore", step.id);
  for (const target of scenario.exploreTargets ?? []) {
    assert.ok(context.allowedUiTargetRefs.includes(target), target);
  }
  assert.equal(context.step?.rationale, step.why);
  assert.deepEqual(buildTutorContext(scenario, "guided", null).stepUiTargetRefs, []);
});

test("guided context normalizes authored hints and discards blank failure messages", async () => {
  const scenario = await loadScenario("vscode-basics.guided");
  const testScenario = {
    ...scenario,
    steps: scenario.steps.map((step) =>
      step.id === "create_file"
        ? {
            ...step,
            helpLevels: ["  Schaue links.  ", "\nExplorer öffnen.\n", " __highlight__ "],
            onFailure: { ...step.onFailure, message: "  \t " },
          }
        : step,
    ),
  };
  const context = buildTutorContext(testScenario, "guided", "create_file");
  assert.deepEqual(context.step?.helpLevels, ["Schaue links.", "Explorer öffnen."]);
  assert.equal(context.step?.possibleFailure, null);
});

test("guided context handles a legacy step without a helpLevels array", async () => {
  const scenario = await loadScenario("vscode-basics.guided");
  const legacyScenario = {
    ...scenario,
    steps: scenario.steps.map((step) =>
      step.id === "create_file" ? { ...step, helpLevels: undefined } : step,
    ),
  } as unknown as typeof scenario;
  const context = buildTutorContext(legacyScenario, "guided", "create_file");
  assert.deepEqual(context.step?.helpLevels, []);
});

test("challenge and explore do not receive graded Guided hints", async () => {
  const scenario = await loadScenario("vscode-basics.guided");
  const challenge = buildTutorContext(scenario, "challenge", "create_file");
  const explore = buildTutorContext(scenario, "explore", "create_file");
  assert.equal(challenge.step?.helpLevels, undefined);
  assert.equal(explore.step?.helpLevels, undefined);
  assert.equal(challenge.step?.possibleFailure, null);
  assert.equal(explore.step?.possibleFailure, null);
  assert.equal(
    challenge.step?.instruction,
    scenario.steps.find((step) => step.id === "create_file")?.instruction,
  );
});

test("tutor context rejects a step that is not part of the scenario", async () => {
  const scenario = await loadScenario("vscode-basics.guided");
  assert.throws(() => buildTutorContext(scenario, "guided", "missing_step"), /Unknown tutor step/);
});
