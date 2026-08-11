import assert from "node:assert/strict";
import test from "node:test";
import vscodeGuided from "../../content/scenarios/vscode-basics.guided.json" with { type: "json" };
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";

test("guided scenario exposes rationale and declarative onFailure metadata", () => {
  const scenario = parseScenario(vscodeGuided);
  const createFile = scenario.steps.find((step) => step.id === "create_file");

  assert.ok(createFile?.rationale?.includes("Dateioperation"));
  assert.deepEqual(createFile?.onFailure, {
    message: "Fast richtig. Für diese Übung brauchen wir genau den Dateinamen notiz.txt.",
    markTarget: "vscode.explorer.tree",
  });
});
