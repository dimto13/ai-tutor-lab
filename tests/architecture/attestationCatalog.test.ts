import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const scenariosDir = new URL("../../content/scenarios/", import.meta.url);
const catalogUrl = new URL("../../content/scoring/scenario-score-catalog.json", import.meta.url);
const generatedResolverUrl = new URL(
  "../../amplify/data/issue-attestation-load-session.generated.js",
  import.meta.url,
);

interface ScenarioContent {
  id: string;
  mode: string;
  points?: number;
  estimatedMinutes?: number;
  learningObjectives?: string[];
  environment?: {
    productId?: string;
    version?: string;
  };
}

interface ScoringDefinition {
  id: string;
  mode: string;
  version: string;
  points: number;
  estimatedMinutes: number;
}

async function scenarioMap(): Promise<Map<string, ScenarioContent>> {
  const result = new Map<string, ScenarioContent>();
  for (const file of (await readdir(scenariosDir)).filter((name) => name.endsWith(".json"))) {
    const source = await readFile(new URL(file, scenariosDir), "utf8");
    const scenario = JSON.parse(source) as ScenarioContent;
    assert.ok(!result.has(scenario.id), `duplicate scenario id ${scenario.id}`);
    result.set(scenario.id, scenario);
  }
  return result;
}

test("generated attestation authority mirrors every scored challenge objective and product version", async () => {
  const [catalogSource, generatedSource, scenarios] = await Promise.all([
    readFile(catalogUrl, "utf8"),
    readFile(generatedResolverUrl, "utf8"),
    scenarioMap(),
  ]);
  const catalog = JSON.parse(catalogSource) as {
    schemaVersion: number;
    scenarios: ScoringDefinition[];
  };
  assert.equal(catalog.schemaVersion, 2);

  const challenges = catalog.scenarios.filter((definition) => definition.mode === "challenge");
  assert.ok(challenges.length > 0, "at least one challenge must be attestable");
  for (const definition of challenges) {
    const scenario = scenarios.get(definition.id);
    assert.ok(scenario, `missing scenario content for ${definition.id}`);
    assert.equal(scenario.mode, "challenge");
    assert.equal(scenario.points, definition.points, `${definition.id} points must stay authoritative`);
    assert.equal(
      scenario.estimatedMinutes,
      definition.estimatedMinutes,
      `${definition.id} timing policy must match content`,
    );
    assert.ok(scenario.learningObjectives && scenario.learningObjectives.length > 0);
    assert.ok(scenario.environment?.productId);
    assert.ok(scenario.environment?.version);

    const definitionStart = generatedSource.indexOf(`${JSON.stringify(definition.id)}:`);
    assert.notEqual(definitionStart, -1, `${definition.id} must exist in generated attestation authority`);
    const nextDefinition = generatedSource.indexOf("\n  \"", definitionStart + definition.id.length + 4);
    const block = generatedSource.slice(
      definitionStart,
      nextDefinition >= 0 ? nextDefinition : generatedSource.indexOf("\n};", definitionStart),
    );
    assert.match(block, new RegExp(`scenarioVersion:\\s*${JSON.stringify(definition.version)}`));
    assert.match(
      block,
      new RegExp(`productId:\\s*${JSON.stringify(scenario.environment?.productId)}`),
    );
    assert.match(
      block,
      new RegExp(`productVersion:\\s*${JSON.stringify(scenario.environment?.version)}`),
    );
    for (const objectiveId of scenario.learningObjectives ?? []) {
      assert.match(
        block,
        new RegExp(JSON.stringify(objectiveId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `${definition.id} must retain objective ${objectiveId}`,
      );
    }
  }
});

test("non-challenge scenarios are not present in attestation authority", async () => {
  const [catalogSource, generatedSource] = await Promise.all([
    readFile(catalogUrl, "utf8"),
    readFile(generatedResolverUrl, "utf8"),
  ]);
  const catalog = JSON.parse(catalogSource) as { scenarios: ScoringDefinition[] };
  for (const definition of catalog.scenarios.filter((entry) => entry.mode !== "challenge")) {
    assert.doesNotMatch(generatedSource, new RegExp(`${JSON.stringify(definition.id)}\\s*:`));
  }
});
