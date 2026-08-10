import assert from "node:assert/strict";
import test from "node:test";
import { VSCODE_RUNTIME_DEFINITION } from "../src/vscodeDefinition.ts";

test("VS Code simulator publishes a semantic runtime definition", () => {
  assert.equal(VSCODE_RUNTIME_DEFINITION.id, "vscode-simulator");
  assert.ok(
    VSCODE_RUNTIME_DEFINITION.surface.some((item) => item.ref === "vscode.activityBar.explorer"),
  );
  assert.ok(
    VSCODE_RUNTIME_DEFINITION.surface.some((item) => item.ref === "vscode.primarySideBar"),
  );
  assert.ok(
    VSCODE_RUNTIME_DEFINITION.surface.some((item) => item.ref === "vscode.secondarySideBar"),
  );
  assert.ok(
    VSCODE_RUNTIME_DEFINITION.surface.some((item) => item.ref === "vscode.sideBar"),
  );
});
