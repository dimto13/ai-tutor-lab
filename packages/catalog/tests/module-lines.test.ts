import assert from "node:assert/strict";
import test from "node:test";
import {
  getDidacticPatternById,
  getModuleLineById,
  moduleLineCatalog,
  parseModuleLineCatalog,
} from "../src/index.ts";

const expectedPhaseIds = [
  "context",
  "task",
  "ai-use",
  "artifact",
  "iteration",
  "verification",
  "transfer",
];

test("module-line catalog exposes the reusable AI workflow line and seven-step pattern", () => {
  const line = getModuleLineById(moduleLineCatalog, "ai-workflows-in-practice");
  assert.ok(line);
  assert.equal(line.title, "KI-Workflows in der Praxis");
  assert.equal(line.learningLayer, "ai_workflow");

  const pattern = getDidacticPatternById(moduleLineCatalog, line.patternId);
  assert.ok(pattern);
  assert.deepEqual(
    pattern.phases.map(({ id }) => id),
    expectedPhaseIds,
  );

  const verification = pattern.phases.find(({ id }) => id === "verification");
  assert.deepEqual(verification?.verificationContract, {
    requiresEmbeddedWeakness: true,
    requiresActiveLearnerAction: true,
    requiresDeterministicValidation: true,
    requiresFeedback: true,
  });
});

test("module-line catalog rejects dangling pattern references", () => {
  assert.throws(() =>
    parseModuleLineCatalog({
      version: 1,
      patterns: [
        {
          id: "pattern",
          title: "Pattern",
          phases: [{ id: "phase", title: "Phase", purpose: "Purpose" }],
        },
      ],
      lines: [
        {
          id: "line",
          title: "Line",
          description: "Description",
          learningLayer: "ai_workflow",
          patternId: "missing-pattern",
          moduleIds: ["module"],
        },
      ],
    }),
  );
});
