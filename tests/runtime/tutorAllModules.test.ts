import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";
import { createHtmlPageWorkflowVariants } from "../../apps/web/src/scenarios/htmlPageWorkflowVariants.ts";
import { createResearchWorkflowVariants } from "../../apps/web/src/scenarios/researchWorkflowVariants.ts";
import {
  createTableDataWorkflowGuidedScenario,
  createTableDataWorkflowVariants,
} from "../../apps/web/src/scenarios/tableDataWorkflowVariants.ts";

import { buildTutorContext } from "../../apps/web/src/tutor/llm/tutorContext.ts";
import { routeTutorModelOutput } from "../../apps/web/src/tutor/llm/tutorModelIntent.ts";
import type { TrainingMode } from "../../packages/training-engine/src/types.ts";

async function allRegisteredScenarioVariants() {
  const directory = path.resolve("content/scenarios");
  const filenames = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const entries = await Promise.all(
    filenames.map(async (name) => ({
      name,
      scenario: parseScenario(JSON.parse(await readFile(path.join(directory, name), "utf8"))),
    })),
  );
  const base = (id: string) => {
    const found = entries.find(({ scenario }) => scenario.id === id)?.scenario;
    assert.ok(found, `Missing authored base scenario ${id}`);
    return found;
  };
  // The runtime registry also generates mode variants from these authored guided scenarios.
  const generated = [
    ...createHtmlPageWorkflowVariants(base("html-page-workflow.guided")),
    ...createResearchWorkflowVariants(base("research-workflow.guided")),
    ...createTableDataWorkflowVariants(base("table-data-workflow.guided")),
    createTableDataWorkflowGuidedScenario(base("table-data-workflow.guided")),
  ];
  return [
    ...entries,
    ...generated.map((scenario) => ({ name: `generated/${scenario.id}`, scenario })),
  ];
}

/**
 * Content-driven regression: automatically includes newly authored JSON scenarios.
 * This tests contracts and scenario grounding with simulated model output, not
 * semantic accuracy of a real Gemma completion (the separate #575 gate).
 */
test("all module/mode scoped Tutor contexts expose individual subtests", async (t) => {
  const entries = await allRegisteredScenarioVariants();
  assert.ok(entries.length >= 18, "Unexpected loss of authored or generated scenario coverage");

  const modules = new Set<string>();
  const modes = new Set<TrainingMode>();
  for (const { name: filename, scenario } of entries) {
    await t.test(`scenario [${filename}] (${scenario.mode ?? "guided"})`, () => {
      const mode: TrainingMode = scenario.mode ?? "guided";
      const moduleId = scenario.moduleId ?? scenario.id;
      modules.add(moduleId);
      modes.add(mode);
      const currentStep = scenario.steps[0];
      assert.ok(currentStep, `${filename}: at least one authored step`);

      const context = buildTutorContext(scenario, mode, currentStep.id, null, {
        completedStepIds: [currentStep.id, currentStep.id, "forged-cross-module-step"],
        hintsUsed: 2,
        failedAttempts: 1,
        exploredTargets: 3,
        recentEventTypes: ["ui.element.inspected"],
      });
      assert.equal(context.scenarioTitle, scenario.title, filename);
      assert.equal(context.mode, mode, filename);
      assert.equal(context.step?.id, currentStep.id, filename);
      assert.equal(context.step?.instruction, currentStep.instruction, filename);
      assert.equal(context.reportedLearnerState?.completedSteps, 1, filename);
      assert.equal(context.reportedLearnerState?.currentStepReportedCompleted, true, filename);
      assert.ok(
        context.allowedUiTargetRefs.every((ref) => ref.length > 0),
        filename,
      );
      assert.equal(
        new Set(context.allowedUiTargetRefs).size,
        context.allowedUiTargetRefs.length,
        filename,
      );

      if (mode === "guided") {
        assert.deepEqual(
          context.step?.helpLevels,
          (currentStep.helpLevels ?? [])
            .map((hint) => hint.trim())
            .filter((hint) => hint && hint !== "__highlight__"),
          filename,
        );
      } else {
        assert.equal(context.step?.helpLevels, undefined, `${filename}: no Guided hint leak`);
        assert.equal(
          context.step?.possibleFailure,
          undefined,
          `${filename}: no Guided failure leak`,
        );
      }
      if (mode === "explore") {
        for (const ref of scenario.exploreTargets ?? []) {
          assert.ok(
            context.allowedUiTargetRefs.includes(ref),
            `${filename}: missing explore ref ${ref}`,
          );
        }
      }
      // Independent of module and mode: a model-classified learner question stays a question,
      // never a report inferred from keywords in the module/step description.
      const answer = routeTutorModelOutput(
        {
          intent: "learning_help",
          confidence: "high",
          answer: `Die aktuelle Aufgabe lautet: ${currentStep.instruction}`,
          kind: "explanation",
          uiTargetRefs: [],
        },
        context.allowedUiTargetRefs,
      );
      assert.equal(answer.action, "answer", filename);
      const report = routeTutorModelOutput(
        {
          intent: "problem_report",
          confidence: "high",
          answer: "Ich kann deine Beobachtung als überprüfbare Meldung vorbereiten.",
          kind: "feedback",
          uiTargetRefs: [],
        },
        context.allowedUiTargetRefs,
      );
      assert.equal(report.action, "offer_feedback", filename);
      assert.throws(
        () => buildTutorContext(scenario, mode, "__unknown_step__"),
        /Unknown tutor step/,
        filename,
      );
    });
  }
  assert.ok(modules.size >= 7, `Expected distinct training modules; found ${modules.size}`);
  assert.deepEqual([...modes].sort(), ["challenge", "explore", "guided"]);
});

test("all module/mode no-step contexts expose individual subtests", async (t) => {
  const entries = await allRegisteredScenarioVariants();
  for (const { name: filename, scenario } of entries) {
    await t.test(`no-active-step [${filename}] (${scenario.mode ?? "guided"})`, () => {
      const mode: TrainingMode = scenario.mode ?? "guided";
      const context = buildTutorContext(scenario, mode, null);
      assert.equal(context.step, null, filename);
      assert.equal(context.reportedLearnerState, undefined, filename);
      assert.equal(context.scenarioTitle, scenario.title, filename);
      assert.ok(Array.isArray(context.allowedUiTargetRefs), filename);
      if (mode === "explore") {
        for (const ref of scenario.exploreTargets ?? []) {
          assert.ok(
            context.allowedUiTargetRefs.includes(ref),
            `${filename}: missing free-explore ref ${ref}`,
          );
        }
      }
    });
  }
});

test("changing to a different module rejects stale steps and client-reported progress", async () => {
  const entries = await allRegisteredScenarioVariants();
  const source = entries.find(({ scenario }) => scenario.steps.length > 0);
  assert.ok(source);
  const previousStepId = source.scenario.steps[0]?.id;
  assert.ok(previousStepId);
  const target = entries.find(
    ({ scenario }) =>
      (scenario.moduleId ?? scenario.id) !== (source.scenario.moduleId ?? source.scenario.id) &&
      scenario.steps.length > 0 &&
      !scenario.steps.some((step) => step.id === previousStepId),
  );
  assert.ok(target, "Expected an independent second module with different step IDs");
  const nextStep = target.scenario.steps[0];
  assert.ok(nextStep);
  const mode: TrainingMode = target.scenario.mode ?? "guided";
  assert.throws(
    () => buildTutorContext(target.scenario, mode, previousStepId),
    /Unknown tutor step/,
    "An earlier module's step must never be accepted in the new scenario",
  );
  const context = buildTutorContext(target.scenario, mode, nextStep.id, null, {
    completedStepIds: [previousStepId, nextStep.id],
    hintsUsed: 0,
    failedAttempts: 0,
    exploredTargets: 0,
    recentEventTypes: [],
  });
  assert.equal(context.step?.id, nextStep.id);
  assert.equal(context.scenarioTitle, target.scenario.title);
  assert.equal(context.reportedLearnerState?.completedSteps, 1);
  assert.equal(context.reportedLearnerState?.currentStepReportedCompleted, true);
});
