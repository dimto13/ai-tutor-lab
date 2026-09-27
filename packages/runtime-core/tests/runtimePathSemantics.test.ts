import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RUNTIME_PATH_COMPARISON,
  findRuntimePath,
  matchesRuntimePath,
  resolveRuntimeEnvironmentSemantics,
} from "../src/runtimeAdapter.ts";

test("a case-insensitive profile accepts equivalent filename casing", () => {
  assert.equal(matchesRuntimePath("NOTIZ.txt", "notiz.txt", "case-insensitive"), true);
  assert.equal(
    findRuntimePath(["README.md", "NOTIZ.txt"], "notiz.txt", "case-insensitive"),
    "NOTIZ.txt",
  );
});

test("a case-sensitive profile keeps filename casing distinct", () => {
  assert.equal(matchesRuntimePath("NOTIZ.txt", "notiz.txt", "case-sensitive"), false);
  assert.equal(
    findRuntimePath(["README.md", "NOTIZ.txt"], "notiz.txt", "case-sensitive"),
    undefined,
  );
});

test("only case differences are folded, never other path differences", () => {
  assert.equal(matchesRuntimePath("docs/notiz.txt", "src/notiz.txt", "case-insensitive"), false);
  assert.equal(matchesRuntimePath("notiz.txt", "notiz.text", "case-insensitive"), false);
  assert.equal(matchesRuntimePath("notiz .txt", "notiz.txt", "case-insensitive"), false);
});

test("case folding does not depend on the locale of the viewer", () => {
  // A Turkish locale lowercases "I" to a dotless i; the fixed folding locale
  // keeps INDEX.md and index.md identical everywhere.
  assert.equal(matchesRuntimePath("INDEX.md", "index.md", "case-insensitive"), true);
});

test("paths stay case-sensitive until a profile declares otherwise", () => {
  assert.equal(DEFAULT_RUNTIME_PATH_COMPARISON, "case-sensitive");
  assert.deepEqual(resolveRuntimeEnvironmentSemantics(undefined, undefined), {
    pathComparison: "case-sensitive",
  });
});

test("the scenario environment profile wins over the runtime default", () => {
  assert.deepEqual(resolveRuntimeEnvironmentSemantics("case-insensitive", "case-sensitive"), {
    pathComparison: "case-insensitive",
  });
  assert.deepEqual(resolveRuntimeEnvironmentSemantics(undefined, "case-insensitive"), {
    pathComparison: "case-insensitive",
  });
});
