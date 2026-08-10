import assert from "node:assert/strict";
import test from "node:test";
import { VSCODE_RUNTIME_DEFINITION } from "../src/vscodeDefinition.ts";

test("VS Code simulator publishes a semantic runtime definition", () => {
  assert.equal(VSCODE_RUNTIME_DEFINITION.id, "vscode-simulator");
  assert.ok(
    VSCODE_RUNTIME_DEFINITION.surface.some((item) => item.ref === "vscode.activityBar.explorer"),
  );
});

test("VS Code simulator distinguishes Primary and Secondary Side Bar semantically", () => {
  const primary = VSCODE_RUNTIME_DEFINITION.surface.find(
    (item) => item.ref === "vscode.primarySideBar",
  );
  const secondary = VSCODE_RUNTIME_DEFINITION.surface.find(
    (item) => item.ref === "vscode.secondarySideBar",
  );

  assert.equal(primary?.label, "Primary Side Bar");
  assert.equal(secondary?.label, "Secondary Side Bar");
  assert.notEqual(primary?.ref, secondary?.ref);
});
