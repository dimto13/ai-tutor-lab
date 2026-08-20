import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  getModuleLineById,
  moduleLineCatalog,
  selectModuleLineItems,
} from "../../packages/catalog/src/index.ts";

type ScenarioReference = {
  id: string;
  learningLayer?: string;
  moduleId?: string;
};

const scenariosDirectory = new URL("../../content/scenarios/", import.meta.url);
const scenarioReferences: ScenarioReference[] = readdirSync(scenariosDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) =>
    JSON.parse(readFileSync(new URL(file, scenariosDirectory), "utf8")),
  ) as ScenarioReference[];

test("AI workflow module line resolves only its declared authored modules", () => {
  const line = getModuleLineById(moduleLineCatalog, "ai-workflows-in-practice");
  const scenarios = selectModuleLineItems(moduleLineCatalog, line.id, scenarioReferences);

  assert.ok(scenarios.length > 0);
  assert.ok(scenarios.every(({ learningLayer }) => learningLayer === "ai_workflow"));
  assert.ok(scenarios.every(({ id }) => id !== "artifact-preview-foundation.guided"));

  const resolvedModuleIds = new Set(scenarios.map(({ moduleId }) => moduleId));
  assert.deepEqual([...resolvedModuleIds].sort(), [...line.moduleIds].sort());
});

test("unknown module line resolves to no scenarios", () => {
  assert.deepEqual(
    selectModuleLineItems(moduleLineCatalog, "unknown-module-line", scenarioReferences),
    [],
  );
});
