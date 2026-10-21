import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findGlossaryConcept,
  getGlossaryConceptByKey,
  getGlossaryConcepts,
} from "../../apps/web/src/lib/glossary.ts";
import {
  classifyWithGlossary,
  replyDeterministically,
} from "../../apps/web/src/tutor/deterministicTutor.ts";
import { getPlatformTopics } from "../../apps/web/src/tutor/platformKnowledge.ts";
import type { TutorContext } from "../../apps/web/src/tutor/tutorContext.ts";
import type { TutorIntent, TutorIntentDecision } from "../../apps/web/src/tutor/tutorIntent.ts";

interface GoldenCase {
  id: string;
  category: string;
  input: string;
  expected: TutorIntent;
  feedbackCandidate?: string;
  platformTopic?: string;
  usability?: boolean;
}

const golden = JSON.parse(
  readFileSync(new URL("./fixtures/tutor-intent-golden.de.json", import.meta.url), "utf8"),
) as { cases: GoldenCase[]; heldOut: GoldenCase[] };

const FEEDBACK_INTENTS = new Set<TutorIntent>(["problem_report", "feature_request", "feedback"]);
// Where a misread report may land: the learner is asked back or the model decides (#147).
const SAFE_FOR_REPORTS = new Set<TutorIntent>([
  "problem_report",
  "feature_request",
  "feedback",
  "unclear",
]);

const context: TutorContext = {
  scenario: {
    id: "golden-scenario",
    title: "VS Code Grundlagen",
    description: "Test",
    learningObjectives: [],
  },
  mode: "guided",
  currentStep: {
    id: "save-file",
    title: "Datei speichern",
    description: "Test",
    instruction: "Speichere die Datei.",
    why: "Erst gespeicherte Änderungen bleiben erhalten.",
    helpLevels: ["Nutze das File-Menü.", "Wähle Save.", "Klicke auf Save."],
    successMessage: "Gespeichert.",
  },
  lastFailure: null,
  completedStepIds: [],
  recentEvents: [],
  hintUsage: 0,
  failedAttempts: 0,
  stateSummary: {
    completedSteps: 0,
    totalSteps: 1,
    isFinished: false,
    exploredTargets: 0,
    hintsUsed: 0,
    mistakes: 0,
  },
};

const glossaryTexts = getGlossaryConcepts().map((concept) => concept.simple);

function routedAsExpected(entry: GoldenCase, decision: TutorIntentDecision): boolean {
  if (decision.intent !== entry.expected) return false;
  if (entry.feedbackCandidate && decision.feedbackCandidate !== entry.feedbackCandidate) {
    return false;
  }
  if (entry.platformTopic && decision.platformTopic?.id !== entry.platformTopic) return false;
  if (entry.usability !== undefined && decision.usability !== entry.usability) return false;
  return true;
}

function isSilentMisroute(entry: GoldenCase, decision: TutorIntentDecision): boolean {
  if (!FEEDBACK_INTENTS.has(entry.expected)) return false;
  if (SAFE_FOR_REPORTS.has(decision.intent)) return false;
  // A statement without a question form goes to the model, never to a glossary text.
  return !(decision.intent === "question" && decision.confidence === "low");
}

test("the golden set covers every tutor category of #575 with at least 30 inputs", () => {
  assert.ok(golden.cases.length >= 30, `only ${golden.cases.length} golden cases`);
  const ids = [...golden.cases, ...golden.heldOut].map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "golden case ids must be unique");
  const categories = new Set(golden.cases.map((entry) => entry.category));
  for (const category of [
    "platform",
    "step_question",
    "tool_question",
    "definition",
    "problem_free_text",
    "feature_free_text",
    "feedback_free_text",
    "general_question",
    "ambiguous",
    "follow_up",
  ]) {
    assert.ok(categories.has(category), `golden set misses category ${category}`);
  }
});

test("at least 90 % of the golden inputs are routed to the expected intent (#147)", (t) => {
  const misses = golden.cases.filter(
    (entry) => !routedAsExpected(entry, classifyWithGlossary(entry.input, findGlossaryConcept)),
  );
  const accuracy = 1 - misses.length / golden.cases.length;
  t.diagnostic(`golden routing ${golden.cases.length - misses.length}/${golden.cases.length}`);
  assert.ok(
    accuracy >= 0.9,
    `routing accuracy ${accuracy.toFixed(2)}; misses: ${misses.map(({ id }) => id).join(", ")}`,
  );
});

test("#548: a complaint about the grading is not answered with the Issue definition", () => {
  const entry = golden.cases.find(({ id }) => id === "548-enter-save-judged-wrong");
  assert.ok(entry);
  const issue = getGlossaryConceptByKey("platform.issues");
  assert.ok(issue);
  // The trigger of #548 is still there: "Aufgabe" is an alias of "Issue".
  assert.equal(findGlossaryConcept(entry.input)?.key, "platform.issues");

  const reply = replyDeterministically(entry.input, context, findGlossaryConcept);
  assert.equal(reply.intent, "problem_report");
  assert.deepEqual(reply.offer, { kind: "problem", clarify: false });
  assert.doesNotMatch(reply.text, /Ein Issue beschreibt/);
});

test("no problem, wish or feedback ends silently in a glossary, step or platform answer", () => {
  for (const entry of [...golden.cases, ...golden.heldOut]) {
    if (!FEEDBACK_INTENTS.has(entry.expected)) continue;
    const decision = classifyWithGlossary(entry.input, findGlossaryConcept);
    assert.ok(!isSilentMisroute(entry, decision), `${entry.id} was routed to ${decision.intent}`);
    const reply = replyDeterministically(entry.input, context, findGlossaryConcept, decision);
    for (const glossaryText of glossaryTexts) {
      assert.ok(!reply.text.includes(glossaryText), `${entry.id} answered with glossary text`);
    }
  }
});

test("held-out inputs keep the safety rule; their exact routing is only reported", (t) => {
  const hits = golden.heldOut.filter((entry) =>
    routedAsExpected(entry, classifyWithGlossary(entry.input, findGlossaryConcept)),
  );
  t.diagnostic(`held-out routing ${hits.length}/${golden.heldOut.length} (not a gate)`);
  assert.ok(golden.heldOut.length >= 10);
});

test("ambiguous inputs ask back with both choices instead of guessing", () => {
  for (const entry of golden.cases.filter(({ expected }) => expected === "unclear")) {
    const reply = replyDeterministically(entry.input, context, findGlossaryConcept);
    assert.equal(reply.offer?.clarify, true, `${entry.id} did not ask back`);
    assert.match(reply.text, /^Ich möchte dich richtig verstehen/);
  }
});

test("reports, wishes and feedback are offered to the learner, never sent by the tutor alone", () => {
  const expectedKinds: Partial<Record<TutorIntent, string[]>> = {
    problem_report: ["problem"],
    feature_request: ["improvement"],
    feedback: ["general", "ux"],
  };
  for (const entry of golden.cases) {
    const kinds = expectedKinds[entry.expected];
    if (!kinds) continue;
    const reply = replyDeterministically(entry.input, context, findGlossaryConcept);
    assert.ok(reply.offer, `${entry.id} has no feedback offer`);
    assert.ok(kinds.includes(reply.offer.kind), `${entry.id} offered ${reply.offer.kind}`);
    assert.equal(reply.offer.clarify, false);
    assert.match(reply.text, /prüfst|weitergeben/);
  }
});

test("platform answers come only from the versioned platform knowledge", () => {
  const answers = new Set(getPlatformTopics().map(({ answer }) => answer));
  for (const entry of golden.cases.filter(({ expected }) => expected === "platform")) {
    const reply = replyDeterministically(entry.input, context, findGlossaryConcept);
    assert.ok(answers.has(reply.text), `${entry.id} answered outside the platform knowledge`);
  }
});

test("a statement without a question form gets no glossary text even when it names a term", () => {
  const reply = replyDeterministically(
    "Der Explorer sieht bei mir anders aus",
    context,
    findGlossaryConcept,
  );
  assert.ok(findGlossaryConcept("Der Explorer sieht bei mir anders aus"));
  for (const glossaryText of glossaryTexts) assert.ok(!reply.text.includes(glossaryText));
  // Without a model the tutor asks back with both ways in the chat instead of sending the learner
  // to a button elsewhere, where the message would have to be described again.
  assert.match(reply.text, /^Ich möchte dich richtig verstehen/);
  assert.doesNotMatch(reply.text, /Ich habe ein Problem/);
  assert.deepEqual(reply.fallbackOffer, { kind: "problem", clarify: true });
  assert.equal(reply.offer, undefined);
});

test("a problem report in guided mode still points at the first help of the step", () => {
  const reply = replyDeterministically("Der Speichern-Button reagiert nicht", context, () => null);
  assert.match(reply.text, /Nutze das File-Menü\.$/);
  const challenge = replyDeterministically(
    "Der Speichern-Button reagiert nicht",
    { ...context, mode: "challenge" },
    () => null,
  );
  assert.doesNotMatch(challenge.text, /File-Menü/);
});

test("the decision matrix turns an everyday report into one offer with the matching platform facts", () => {
  const entry = golden.cases.find(({ id }) => id === "pilot-1019-points-window-chat");
  assert.ok(entry);
  const reply = replyDeterministically(entry.input, context, findGlossaryConcept);
  assert.equal(reply.intent, "problem_report");
  assert.deepEqual(reply.offer, { kind: "problem", clarify: false });
  assert.match(reply.text, /nichts noch einmal eintippen/);
  // The learner could not check the points, so the reply says where they are shown.
  assert.match(reply.text, /Kompetenzprofil/);
  assert.doesNotMatch(reply.text, /Ich habe ein Problem/);
});
