import assert from "node:assert/strict";
import test from "node:test";
import { preferServerTutor } from "../src/tutor/serverTutorAnswer.ts";

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
  ];
  for (const ask of failures) {
    assert.deepEqual(await preferServerTutor(DETERMINISTIC, ask), {
      answer: DETERMINISTIC,
      uiTargetRefs: [],
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
