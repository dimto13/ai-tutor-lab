import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";

interface QualityCase {
  id: string;
  scenarioId: string;
  step: "first" | "none";
  expectedIntent: string;
  question: string;
  split: "main" | "held-out";
  critical: boolean;
}

test("#575: each real-model corpus entry is independently validated without model calls", async (t) => {
  const corpus = JSON.parse(
    await readFile("tests/runtime/fixtures/tutor-quality-live.de.json", "utf8"),
  ) as { version: number; model: string; cases: QualityCase[] };
  assert.equal(corpus.version, 1);
  assert.equal(corpus.model, "gemma4:e4b");
  assert.ok(corpus.cases.length >= 30);
  assert.ok(corpus.cases.filter((entry) => entry.split === "held-out").length >= 10);
  assert.ok(corpus.cases.filter((entry) => entry.critical).length >= 10);
  assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, corpus.cases.length);
  assert.equal(new Set(corpus.cases.map((entry) => entry.question)).size, corpus.cases.length);
  const names = new Set(
    (await readdir("content/scenarios")).filter((name) => name.endsWith(".json")),
  );
  const modules = new Set<string>();
  const modes = new Set<string>();
  const intents = new Set<string>();
  for (const entry of corpus.cases) {
    await t.test(`quality case [${entry.id}]`, async () => {
      assert.match(entry.id, /^qa-\d{3}$/);
      assert.ok(entry.question.trim().length >= 12);
      const filename = `${entry.scenarioId}.json`;
      assert.ok(names.has(filename), `Missing published scenario: ${filename}`);
      const scenario = parseScenario(
        JSON.parse(await readFile(path.join("content/scenarios", filename), "utf8")),
      );
      assert.equal(scenario.id, entry.scenarioId);
      const mode = scenario.mode ?? "guided";
      modules.add(scenario.moduleId ?? scenario.id);
      modes.add(mode);
      intents.add(entry.expectedIntent);
      assert.ok(entry.step === "none" || scenario.steps.length > 0);
      assert.equal(entry.scenarioId.split(".").at(-1), mode);
      assert.ok(["main", "held-out"].includes(entry.split));
      assert.equal(typeof entry.critical, "boolean");
    });
  }
  assert.ok(modules.size >= 12, `Expected >=12 distinct module families, found ${modules.size}`);
  assert.deepEqual([...modes].sort(), ["challenge", "explore", "guided"]);
  for (const intent of [
    "learning_help",
    "platform_question",
    "tool_question",
    "general_question",
    "problem_report",
    "feature_request",
    "feedback",
    "smalltalk",
    "unclear",
  ])
    assert.ok(intents.has(intent), `Missing intent: ${intent}`);
});
