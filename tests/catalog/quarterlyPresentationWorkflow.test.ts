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

type JsonRecord = Record<string, unknown>;
type Artifact = {
  id: string;
  html?: string;
  rows?: Array<{ criterion: string }>;
  value?: {
    sharedBasis: { sources: string[]; audience: string };
    inventionPolicy: string;
    qualityFinding: string;
    effectiveSkillRules: string[];
  };
};
type Scenario = {
  environment: {
    seed: {
      contents: Record<string, string>;
      artifactPreview: { artifacts: Artifact[] };
    };
  };
};

async function readJson<T>(path: URL): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

test("quarterly presentation workflow keeps A/B evidence on one shared synthetic basis", async () => {
  const scenario = await readJson<Scenario>(scenarioPath);
  const artifacts = scenario.environment.seed.artifactPreview.artifacts;
  const free = artifacts.find((artifact) => artifact.id === "presentation-free");
  const skilled = artifacts.find((artifact) => artifact.id === "presentation-skilled");
  const review = artifacts.find((artifact) => artifact.id === "presentation-review");

  assert.ok(free?.html && skilled?.html && review?.value, "A, B and review artifacts must exist");
  assert.deepEqual(review.value.sharedBasis.sources, ["SYN-Q1-2026", "SYN-Q2-2026", "SYN-Q3-2026"]);
  assert.equal(review.value.sharedBasis.audience, "Geschäftsführung der fiktiven Beispiel GmbH");
  assert.match(free.html, /12,0/);
  assert.match(skilled.html, /12,0/);
  assert.match(review.value.inventionPolicy, /gelten als Fehler/);
  assert.match(review.value.qualityFinding, /Kapazitätsfreigabe/);
  assert.ok(review.value.effectiveSkillRules.length >= 3);
});

test("quarterly presentation workflow exposes the required comparison dimensions", async () => {
  const scenario = await readJson<Scenario>(scenarioPath);
  const comparison = scenario.environment.seed.artifactPreview.artifacts.find(
    (artifact) => artifact.id === "presentation-comparison",
  );
  assert.ok(comparison?.rows, "comparison artifact must expose rows");
  const criteria = comparison.rows.map((row) => row.criterion);

  for (const required of [
    "Nachvollziehbarkeit",
    "Bearbeitbarkeit",
    "Quellenbezug",
    "Visuelle Qualität",
  ]) {
    assert.ok(criteria.includes(required), `missing comparison criterion: ${required}`);
  }
});

test("management presentation skill is reusable and keeps invention guards explicit", async () => {
  const scenario = await readJson<Scenario>(scenarioPath);
  const skill = await readJson<JsonRecord>(skillPath);
  const serialized = JSON.stringify(skill);
  const seededSkill = scenario.environment.seed.contents["presentation-skill.md"];

  assert.match(serialized, /Storyline/i);
  assert.match(serialized, /Folientitel/i);
  assert.match(serialized, /Layout/i);
  assert.match(serialized, /Quellen/i);
  assert.match(serialized, /technische/i);
  assert.match(serialized, /Prognosen/i);
  assert.match(seededSkill, /management-presentation\.v1/);
  for (const contractTerm of [
    "Storyline",
    "Folientitel",
    "Layout",
    "Quellen",
    "Technische Qualität",
    "Keine Erfindungen",
  ]) {
    assert.match(
      seededSkill,
      new RegExp(contractTerm, "i"),
      `seeded skill must preserve ${contractTerm}`,
    );
  }
});
