import assert from "node:assert/strict";
import test from "node:test";
import {
  filePathEquals,
  getGuidedInstructionSegments,
  getPrimaryShortcutVariant,
} from "../src/guidedInstruction.ts";

test("plain instructions remain backward compatible text segments", () => {
  assert.deepEqual(getGuidedInstructionSegments("Create index.html"), [
    { kind: "text", text: "Create index.html" },
  ]);
});

test("declared literal input is preserved verbatim", () => {
  const segments = getGuidedInstructionSegments("ignored", {
    segments: [
      { kind: "text", text: "Enter " },
      { kind: "literal-input", text: "Hello, World!" },
    ],
  });

  assert.equal(segments[1]?.kind, "literal-input");
  assert.equal(segments[1]?.text, "Hello, World!");
});

test("file path comparison follows only the declared runtime policy", () => {
  assert.equal(filePathEquals("Index.HTML", "index.html", "case-insensitive"), true);
  assert.equal(filePathEquals("Index.HTML", "index.html", "case-sensitive"), false);
});

test("shortcut primary platform is explicit and falls back deterministically", () => {
  const variants = [
    { platform: "macos" as const, keys: ["Meta", "S"] },
    { platform: "windows" as const, keys: ["Ctrl", "S"] },
    { platform: "linux" as const, keys: ["Ctrl", "S"] },
  ];

  assert.deepEqual(getPrimaryShortcutVariant({ variants, primaryPlatform: "windows" }), variants[1]);
  assert.deepEqual(getPrimaryShortcutVariant({ variants }), variants[0]);
});
