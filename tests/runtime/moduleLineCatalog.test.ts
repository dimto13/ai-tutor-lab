import assert from "node:assert/strict";
import test from "node:test";
import { getModuleLineById, moduleLineCatalog } from "../../packages/catalog/src/index.ts";
import { getScenariosForModuleLine } from "../../apps/web/src/scenarios/index.ts";

test("AI workflow module line resolves only its declared ai_workflow modules", () => {
  const line = getModuleLineById(moduleLineCatalog, "ai-workflows-in-practice");
  assert.ok(line);

  const scenarios = getScenariosForModuleLine(line.id);
  assert.ok(scenarios.length > 0);
  assert.ok(scenarios.every(({ learningLayer }) => learningLayer === "ai_workflow"));

  const resolvedModuleIds = new Set(scenarios.map(({ moduleId }) => moduleId));
  assert.deepEqual([...resolvedModuleIds].sort(), [...line.moduleIds].sort());
});

test("unknown module line resolves to no scenarios", () => {
  assert.deepEqual(getScenariosForModuleLine("unknown-module-line"), []);
});
