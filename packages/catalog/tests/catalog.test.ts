import assert from "node:assert/strict";
import test from "node:test";
import { technologyCatalog } from "../src/index.ts";

test("catalog package loads the declarative technology catalog", () => {
  assert.ok(technologyCatalog.products.some((product) => product.id === "vscode"));
  assert.ok(technologyCatalog.runtimeAdapters.some((runtime) => runtime.id === "vscode-simulator"));
});
