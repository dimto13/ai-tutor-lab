import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scenarioPath = new URL(
  "../../content/scenarios/quarterly-presentation-workflow.guided.json",
  import.meta.url,
);
const skillPath = new URL(
  "../../content/skills/management-presentation.v1.json",
  import.meta.url,
);

async function readJson(path: URL): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

test("quarterly presentation workflow keeps A/B evidence on one shared synthetic basis", async () => {
  const scenario = await readJson(scenarioPath);
  const artifacts = scenario.environment.seed.artifactPreview.artifacts;
  const free = artifacts.find((artifact: any) => artifact.id === "presentation-free");
  const skilled = artifacts.find(
    (artifact: any) => artifact.id === "presentation-skilled",
  );
  const review = artifacts.find((artifact: any) => artifact.id === "presentation-review");

  assert.ok(free && skilled && review, "A, B and review artifacts must exist");
  assert.deepEqual(review.value.sharedBasis.sources, [
    "SYN-Q1-2026",
    "SYN-Q2-2026",
    "SYN-Q3-2026",
  ]);
  assert.equal(
    review.value.sharedBasis.audience,
    "Geschäftsführung der fiktiven Beispiel GmbH",
  );
  assert.match(free.html, /12,0/);
  assert.match(skilled.html, /12,0/);
  assert.match(review.value.inventionPolicy, /gelten als Fehler/);
  assert.match(review.value.qualityFinding, /Kapazitätsfreigabe/);
  assert.ok(review.value.effectiveSkillRules.length >= 3);
});

test("quarterly presentation workflow exposes the required comparison dimensions", async () => {
  const scenario = await readJson(scenarioPath);
  const comparison = scenario.environment.seed.artifactPreview.artifacts.find(
    (artifact: any) => artifact.id === "presentation-comparison",
  );
  const criteria = comparison.rows.map((row: any) => row.criterion);

  for (const required of [
    "Nachvollziehbarkeit",
    "Bearbeitbarkeit",
    "Quellenbezug",
    "Visuelle Qualität",
  ]) {
    assert.ok(
      criteria.includes(required),
      `missing comparison criterion: ${required}`,
    );
  }
});

test("management presentation skill is reusable and keeps invention guards explicit", async () => {
  const skill = await readJson(skillPath);
  const serialized = JSON.stringify(skill);

  assert.match(serialized, /Storyline/i);
  assert.match(serialized, /Folientitel/i);
  assert.match(serialized, /Layout/i);
  assert.match(serialized, /Quellen/i);
  assert.match(serialized, /technische/i);
  assert.match(serialized, /Prognosen/i);
});
