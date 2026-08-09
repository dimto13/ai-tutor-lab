import assert from "node:assert/strict";
import test from "node:test";
import {
  findGlossaryConcept,
  getGlossaryConceptByKey,
  getGlossaryConceptsForTechnology,
  segmentGlossaryText,
} from "../../src/lib/glossary.ts";
import { answerDeterministically } from "../../src/tutor/deterministicTutor.ts";
import type { TutorContext } from "../../src/tutor/tutorContext.ts";

const tutorContext: TutorContext = {
  scenario: {
    id: "glossary-test",
    title: "Glossar-Test",
    description: "Testkontext",
    learningObjectives: [],
  },
  mode: "guided",
  currentStep: null,
  completedStepIds: [],
  recentEvents: [],
  hintUsage: 0,
  failedAttempts: 0,
  stateSummary: {
    completedSteps: 0,
    totalSteps: 0,
    isFinished: false,
    exploredTargets: 0,
    hintsUsed: 0,
    mistakes: 0,
  },
};

test("glossary annotation prefers the longer product term over overlapping Code", () => {
  const conceptKeys = getGlossaryConceptsForTechnology("ide").map((concept) => concept.key);
  const segments = segmentGlossaryText("VS Code zeigt Code im Editor.", conceptKeys);
  const annotated = segments
    .filter((segment) => segment.concept)
    .map((segment) => ({ text: segment.text, key: segment.concept?.key }));

  assert.deepEqual(annotated, [
    { text: "VS Code", key: "vscode.product" },
    { text: "Code", key: "foundation.code" },
  ]);
});

test("tutor question resolves VS Code to the specific product definition", () => {
  const product = getGlossaryConceptByKey("vscode.product");
  const genericCode = getGlossaryConceptByKey("foundation.code");
  assert.ok(product);
  assert.ok(genericCode);

  const resolved = findGlossaryConcept("Was ist VS Code?");
  assert.equal(resolved?.key, "vscode.product");

  const answer = answerDeterministically("Was ist VS Code?", tutorContext, findGlossaryConcept);
  assert.equal(answer, product.simple);
  assert.notEqual(answer, genericCode.simple);
});

test("standalone Code remains available as the generic glossary concept", () => {
  const genericCode = getGlossaryConceptByKey("foundation.code");
  assert.ok(genericCode);

  assert.equal(findGlossaryConcept("Was ist Code?")?.key, "foundation.code");
  assert.equal(
    answerDeterministically("Was ist Code?", tutorContext, findGlossaryConcept),
    genericCode.simple,
  );
});

test("specific product aliases deterministically outrank overlapping shorter terms", () => {
  assert.equal(findGlossaryConcept("Was ist Visual Studio Code?")?.key, "vscode.product");
});
