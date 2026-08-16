import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const engineNavigationUrl = new URL(
  "../../packages/training-engine/src/guidedNavigation.ts",
  import.meta.url,
);
const coordinatorUrl = new URL(
  "../../apps/web/src/state/guidedNavigationCoordinator.ts",
  import.meta.url,
);

test("guided navigation keeps runtime product semantics out of the engine and coordinator", async () => {
  const [engineSource, coordinatorSource] = await Promise.all([
    readFile(engineNavigationUrl, "utf8"),
    readFile(coordinatorUrl, "utf8"),
  ]);

  for (const source of [engineSource, coordinatorSource]) {
    assert.doesNotMatch(source, /vscode|claude|notiz\.txt|editor\.activate-file/i);
  }
  assert.match(engineSource, /status.*=== "COMPLETED"/s);
  assert.doesNotMatch(engineSource, /score|award|points|restore\(|snapshot\(/i);
  assert.match(coordinatorSource, /runtime\.snapshot\(\)/);
  assert.match(coordinatorSource, /runtime\.restore\(snapshot\)/);
});
