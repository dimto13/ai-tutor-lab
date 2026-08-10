import assert from "node:assert/strict";
import test from "node:test";
import {
  findGlossaryConcept,
  getGlossaryConceptByKey,
  getGlossaryConceptForTarget,
  getGlossaryConceptsForTechnology,
  segmentGlossaryText,
} from "../../apps/web/src/lib/glossary.ts";
import { answerDeterministically } from "../../apps/web/src/tutor/deterministicTutor.ts";
import type { TutorContext } from "../../apps/web/src/tutor/tutorContext.ts";

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
  const segments = segmentGlossaryText("VS Code zeigt Code.", conceptKeys);
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

test("VS Code UI foundations provide non-programmer analogies", () => {
  const expectedAnalogies = new Map([
    ["vscode.activity_bar", "Outlook"],
    ["vscode.side_bar", "Word"],
    ["vscode.view", "Office"],
    ["vscode.explorer", "Office"],
    ["vscode.editor", "Word"],
    ["vscode.panel", "Office"],
    ["vscode.terminal", "Excel"],
    ["vscode.status_bar", "Word"],
  ]);

  for (const [conceptKey, analogyMarker] of expectedAnalogies) {
    const concept = getGlossaryConceptByKey(conceptKey);
    assert.ok(concept, `missing glossary concept ${conceptKey}`);
    assert.match(concept.simple, new RegExp(analogyMarker, "i"), `${conceptKey} lacks its analogy`);
  }
});

test("every VS Code top-level menu resolves to its own beginner explanation", () => {
  const expectedMenus = new Map([
    ["vscode.menu.file", "vscode.file_menu"],
    ["vscode.menu.edit", "vscode.edit_menu"],
    ["vscode.menu.selection", "vscode.selection_menu"],
    ["vscode.menu.view", "vscode.view_menu"],
    ["vscode.menu.go", "vscode.go_menu"],
    ["vscode.menu.run", "vscode.run_menu"],
    ["vscode.menu.terminal", "vscode.terminal_menu"],
    ["vscode.menu.help", "vscode.help_menu"],
  ]);

  for (const [target, conceptKey] of expectedMenus) {
    const concept = getGlossaryConceptForTarget(target);
    assert.equal(concept?.key, conceptKey, `${target} resolves to the wrong menu concept`);
    assert.ok(concept?.simple.length, `${conceptKey} has no beginner explanation`);
  }
});
