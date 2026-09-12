import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";
import { buildTutorContext } from "../../apps/web/src/tutor/llm/tutorContext.ts";

async function loadScenario(id: string) {
  const raw = await readFile(path.resolve("content/scenarios", `${id}.json`), "utf8");
  return parseScenario(JSON.parse(raw));
}

test("guided tutor context allows only the targets of the current step", async () => {
  const scenario = await loadScenario("vscode-basics.guided");
  const context = buildTutorContext(scenario, "guided", "create_file");

  assert.equal(context.step?.id, "create_file");
  assert.deepEqual(context.allowedUiTargetRefs, [
    "vscode.explorer.newFile",
    "vscode.explorer.tree",
  ]);
});

test("tutor context rejects a step that is not part of the scenario", async () => {
  const scenario = await loadScenario("vscode-basics.guided");
  assert.throws(() => buildTutorContext(scenario, "guided", "missing_step"), /Unknown tutor step/);
});
