import assert from "node:assert/strict";
import test from "node:test";
import {
  TUTOR_MODEL_INTENTS,
  routeTutorModelIntent,
  routeTutorModelOutput,
  tutorModelOutputSchema,
  tutorModelIntentSchema,
} from "../src/tutor/llm/tutorModelIntent.ts";

test("every model-declared intent is routed without any keyword matching", () => {
  for (const intent of TUTOR_MODEL_INTENTS) {
    const route = routeTutorModelIntent({ intent, confidence: "high" });
    if (intent === "unclear") {
      assert.deepEqual(route, { action: "clarify", reason: "unclear_intent" });
    } else if (intent === "problem_report") {
      assert.deepEqual(route, { action: "offer_feedback", intent, feedbackKind: "problem" });
    } else if (intent === "feature_request") {
      assert.deepEqual(route, {
        action: "offer_feedback",
        intent,
        feedbackKind: "improvement",
      });
    } else if (intent === "feedback") {
      assert.deepEqual(route, { action: "offer_feedback", intent, feedbackKind: "general" });
    } else {
      assert.deepEqual(route, { action: "answer", intent });
    }
  }
});

test("low confidence always clarifies even for plausible feedback or learning paths", () => {
  for (const intent of TUTOR_MODEL_INTENTS) {
    assert.deepEqual(routeTutorModelIntent({ intent, confidence: "low" }), {
      action: "clarify",
      reason: "low_confidence",
    });
  }
});

test("invalid or injected model decisions cannot cause feedback or silent wrong routing", () => {
  const invalid = [
    null,
    [],
    { intent: "bug", confidence: "high" },
    { intent: "problem_report", confidence: "98%" },
    { intent: "problem_report", confidence: "high", sendAutomatically: true },
    { intent: "learning_help", confidence: "high", role: "system" },
    { confidence: "high" },
  ];
  for (const candidate of invalid) {
    assert.equal(tutorModelIntentSchema.safeParse(candidate).success, false);
    assert.deepEqual(routeTutorModelIntent(candidate), {
      action: "clarify",
      reason: "invalid_model_decision",
    });
  }
});

test("model intent never sends user feedback: it only proposes a correctable offer", () => {
  const result = routeTutorModelIntent({
    intent: "problem_report",
    confidence: "high",
  });
  assert.equal(result.action, "offer_feedback");
  assert.equal(Object.hasOwn(result, "send"), false);
  assert.equal(Object.hasOwn(result, "userText"), false);
});

test("structured provider response rejects hidden side-effect fields and duplicated targets", () => {
  const base = {
    intent: "tool_question",
    confidence: "high",
    answer: "Das Terminal befindet sich unten in der Oberfläche.",
    kind: "ui_action",
    uiTargetRefs: ["vscode.panel.terminal"],
  } as const;
  const allowed = ["vscode.panel.terminal"];
  assert.equal(tutorModelOutputSchema.safeParse(base).success, true);
  assert.equal(routeTutorModelOutput(base, allowed).action, "answer");
  for (const invalid of [
    { ...base, autoSubmit: true },
    { ...base, score: 100 },
    { ...base, answer: "" },
    { ...base, answer: "x".repeat(4_001) },
    { ...base, uiTargetRefs: ["vscode.panel.terminal", "vscode.panel.terminal"] },
    { ...base, uiTargetRefs: ["vscode.panel.missing"] },
  ]) {
    const result = routeTutorModelOutput(invalid, allowed);
    assert.equal(result.action, "clarify");
  }
});

test("provider cannot smuggle a feedback write into a model-labelled learning answer", () => {
  const result = routeTutorModelOutput(
    {
      intent: "learning_help",
      confidence: "high",
      answer: "Ich habe automatisch einen Fehlerbericht angelegt.",
      kind: "feedback",
      uiTargetRefs: [],
    },
    [],
  );
  assert.equal(result.action, "clarify");
  if (result.action !== "clarify") assert.fail("Mismatched intent and kind must not be accepted");
  assert.equal(result.reason, "invalid_model_decision");
  assert.doesNotMatch(result.answer, /automatisch einen Fehlerbericht angelegt/);
});
