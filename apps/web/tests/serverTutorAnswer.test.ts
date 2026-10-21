import assert from "node:assert/strict";
import test from "node:test";
import { preferServerTutor, resolveModelFirstTutor } from "../src/tutor/serverTutorAnswer.ts";

const DETERMINISTIC = "Öffne den Explorer über das oberste Symbol der Activity Bar.";

test("the deterministic answer stays whenever the server tutor fails (#28, #481)", async () => {
  const failures = [
    () => Promise.reject(new Error("LLM provider request failed (502): relay output unusable")),
    () =>
      Promise.reject(
        Object.assign(new Error("The operation was aborted due to timeout"), {
          name: "TimeoutError",
        }),
      ),
    () => Promise.resolve({ status: "unavailable" as const }),
    () =>
      Promise.resolve({
        status: "ok" as const,
        answer: "  ",
        uiTargetRefs: ["vscode.panel.terminal"],
        model: "gemma4:31b",
      }),
  ];
  for (const ask of failures) {
    assert.deepEqual(await preferServerTutor(DETERMINISTIC, ask), {
      answer: DETERMINISTIC,
      uiTargetRefs: [],
      fallback: true,
    });
  }
});

test("a server answer replaces the deterministic one and points only after the guardrails", async () => {
  assert.deepEqual(
    await preferServerTutor(DETERMINISTIC, async () => ({
      status: "ok",
      answer: "Das Terminal liegt unten im Panel.",
      uiTargetRefs: ["vscode.panel.terminal"],
      model: "gemma4:31b",
    })),
    { answer: "Das Terminal liegt unten im Panel.", uiTargetRefs: ["vscode.panel.terminal"] },
  );
  assert.deepEqual(
    await preferServerTutor(DETERMINISTIC, async () => ({
      status: "guardrail",
      answer: "Kannst du die Frage genauer stellen?",
      uiTargetRefs: ["vscode.panel.terminal"],
      model: "gemma4:31b",
    })),
    { answer: "Kannst du die Frage genauer stellen?", uiTargetRefs: [] },
  );
});

test("the server adapter retains a model-selected feedback kind without submitting it", async () => {
  assert.deepEqual(
    await preferServerTutor(DETERMINISTIC, async () => ({
      status: "ok",
      answer: "Du meldest eine unpassende Bewertung.",
      kind: "feedback",
      intent: "problem_report",
      feedbackKind: "problem",
      uiTargetRefs: [],
      model: "gemma4:e4b@local",
    })),
    {
      answer: "Du meldest eine unpassende Bewertung.",
      uiTargetRefs: [],
      kind: "feedback",
      intent: "problem_report",
      feedbackKind: "problem",
    },
  );
});

test("model is asked before the offline classifier even for an obvious-looking complaint (#147)", async () => {
  const order: string[] = [];
  const result = await resolveModelFirstTutor(
    async () => {
      order.push("model");
      return {
        status: "ok",
        answer: "Das ist eine Sachfrage zu einem Fehlerbegriff.",
        kind: "explanation",
        intent: "tool_question",
        uiTargetRefs: [],
        model: "gemma4:e4b@local",
      };
    },
    () => {
      order.push("keyword-fallback");
      return { text: "Falsches Meldeangebot", intent: "problem_report" };
    },
  );
  assert.deepEqual(order, ["model"]);
  assert.equal(result.answer, "Das ist eine Sachfrage zu einem Fehlerbegriff.");
  assert.equal(result.intent, "tool_question");
  assert.equal(result.fallback, undefined);
});

test("unavailable transport triggers the lexical fallback only afterwards, never an automatic send", async () => {
  const order: string[] = [];
  const result = await resolveModelFirstTutor(
    async () => {
      order.push("model");
      return { status: "unavailable" };
    },
    () => {
      order.push("fallback");
      return {
        text: "Möchtest du das melden?",
        intent: "unclear",
        fallbackOffer: { kind: "problem", clarify: true },
      };
    },
  );
  assert.deepEqual(order, ["model", "fallback"]);
  assert.equal(result.fallback, true);
  assert.deepEqual(result.fallbackOffer, { kind: "problem", clarify: true });
  assert.equal(Object.hasOwn(result, "sent"), false);
});

test("model feedback remains a confirmation-only recommendation; no fallback can override it", async () => {
  let fallbackCalls = 0;
  const result = await resolveModelFirstTutor(
    async () => ({
      status: "ok",
      answer: "Ich verstehe den Änderungswunsch.",
      kind: "feedback",
      intent: "feature_request",
      feedbackKind: "improvement",
      uiTargetRefs: [],
      model: "gemma4:e4b@local",
    }),
    () => {
      fallbackCalls += 1;
      return { text: "Falsch", intent: "question" };
    },
  );
  assert.equal(fallbackCalls, 0);
  assert.equal(result.feedbackKind, "improvement");
  assert.equal(Object.hasOwn(result, "sent"), false);
});

test("an explicit answer preference is sent to the model instead of reclassifying before it", async () => {
  let fallbackCalls = 0;
  const result = await resolveModelFirstTutor(
    async () => ({
      status: "ok",
      answer: "Dafür musst du den aktuellen Schritt erneut prüfen.",
      kind: "explanation",
      intent: "learning_help",
      uiTargetRefs: [],
      model: "gemma4:e4b@local",
    }),
    () => {
      fallbackCalls += 1;
      return { text: "Falsch", intent: "problem_report" };
    },
  );
  assert.equal(fallbackCalls, 0);
  assert.equal(result.kind, "explanation");
});

test("guardrail rejection never falls through to keyword routing (#548)", async () => {
  let offlineCalls = 0;
  const result = await resolveModelFirstTutor(
    async () => ({
      status: "guardrail",
      answer: "Brauchst du Hilfe oder möchtest du die Beobachtung melden?",
      uiTargetRefs: [],
      model: "gemma4:e4b@local",
    }),
    () => {
      offlineCalls += 1;
      return { text: "Unbelegte Glossarantwort", intent: "definition" };
    },
  );
  assert.equal(offlineCalls, 0);
  assert.equal(result.answer, "Brauchst du Hilfe oder möchtest du die Beobachtung melden?");
  assert.deepEqual(result.uiTargetRefs, []);
  assert.equal(result.fallback, undefined);
});

test("without an authenticated model route, the offline Tutor remains available", async () => {
  let offlineCalls = 0;
  const result = await resolveModelFirstTutor(null, () => {
    offlineCalls += 1;
    return { text: "Die Plattform ist gerade offline. Was möchtest du wissen?", intent: "question" };
  });
  assert.equal(offlineCalls, 1);
  assert.equal(result.fallback, true);
  assert.deepEqual(result.uiTargetRefs, []);
});
