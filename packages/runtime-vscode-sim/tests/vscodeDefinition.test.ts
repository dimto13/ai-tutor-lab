import assert from "node:assert/strict";
import test from "node:test";
import { VSCODE_RUNTIME_DEFINITION } from "../src/vscodeDefinition.ts";

test("VS Code simulator publishes a semantic runtime definition", () => {
  const surfaceRefs = new Set<string>(VSCODE_RUNTIME_DEFINITION.surface.map((item) => item.ref));

  assert.equal(VSCODE_RUNTIME_DEFINITION.id, "vscode-simulator");
  assert.ok(surfaceRefs.has("vscode.activityBar.explorer"));
  assert.ok(surfaceRefs.has("vscode.primarySideBar"));
  assert.ok(surfaceRefs.has("vscode.secondarySideBar"));
  assert.ok(surfaceRefs.has("vscode.sideBar"));
  assert.ok(surfaceRefs.has("vscode.menu.terminal"));
  assert.ok(!surfaceRefs.has("vscode.statusBar.terminal"));
});
