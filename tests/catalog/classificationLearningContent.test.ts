import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const corpus = JSON.parse(
  await readFile(new URL("../../content/classification/synthetic-document-corpus.de.json", import.meta.url), "utf8"),
) as {
  corpus: {
    allEntitiesAndNumbersFictional: boolean;
    documents: Array<{ id: string; synthetic: boolean; content: string }>;
  };
};

async function readScenario(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(new URL(`../../content/scenarios/${name}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

function collectClassificationSpecs(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = value as Record<string, unknown>;
  const own = candidate["kind"] === "classification" ? [candidate] : [];
  const nested = Array.isArray(candidate["of"])
    ? candidate["of"].flatMap((entry) => collectClassificationSpecs(entry))
    : [];
  return [...own, ...nested];
}

test("classification learning content uses five guided and ten challenge synthetic documents", async () => {
  const guided = await readScenario("data-classification-ai-usage.guided.json");
  const challenge = await readScenario("data-classification-ai-usage.challenge.json");
  const guidedSteps = guided["steps"] as Array<{ validation?: unknown }>;
  const guidedSpecs = guidedSteps.flatMap((step) => collectClassificationSpecs(step.validation));
  const challengeSpecs = collectClassificationSpecs(challenge["completionValidation"]);
  const syntheticIds = new Set(
    corpus.corpus.documents.filter((document) => document.synthetic).map((document) => document.id),
  );

  assert.equal(corpus.corpus.allEntitiesAndNumbersFictional, true);
  assert.equal(guidedSpecs.length, 5);
  assert.equal(challengeSpecs.length, 10);
  assert.equal(new Set(challengeSpecs.map((spec) => spec["documentId"])).size, 10);

  for (const spec of [...guidedSpecs, ...challengeSpecs]) {
    assert.equal(typeof spec["documentId"], "string");
    assert.ok(syntheticIds.has(spec["documentId"] as string));
    assert.equal(spec["selector"], "classification.validation.state");
    assert.ok(Object.keys(spec["expectedAiDecisions"] as Record<string, boolean>).length > 0);
  }
});

test("uncertainty escalation is explicit learning content, not a test-only rule", async () => {
  const guided = JSON.stringify(await readScenario("data-classification-ai-usage.guided.json"));
  const challenge = JSON.stringify(await readScenario("data-classification-ai-usage.challenge.json"));
  const explore = JSON.stringify(await readScenario("data-classification-ai-usage.explore.json"));

  for (const content of [explore, guided, challenge]) {
    assert.match(content, /Im Zweifel höher einstufen/);
  }
  assert.match(guided, /uncertaintyEscalationFromLevelId/);
  assert.match(challenge, /uncertaintyEscalationFromLevelId/);
});

test("scenario fixtures reference corpus ids instead of embedding document bodies", async () => {
  const scenarioNames = [
    "data-classification-ai-usage.explore.json",
    "data-classification-ai-usage.guided.json",
    "data-classification-ai-usage.challenge.json",
  ];
  const documentBodies = corpus.corpus.documents.map((document) => document.content);

  for (const scenarioName of scenarioNames) {
    const source = await readFile(new URL(`../../content/scenarios/${scenarioName}`, import.meta.url), "utf8");
    for (const body of documentBodies) assert.equal(source.includes(body), false);
  }
});
