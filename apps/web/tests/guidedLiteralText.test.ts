import assert from "node:assert/strict";
import test from "node:test";
import { segmentGuidedLiteralText } from "../src/lib/guidedLiteralText.ts";

test("guided literal parser preserves plain text", () => {
  assert.deepEqual(segmentGuidedLiteralText("Öffne den Explorer."), [
    { kind: "text", text: "Öffne den Explorer." },
  ]);
});

test("guided literal parser keeps adjacent literals distinct", () => {
  assert.deepEqual(segmentGuidedLiteralText("`alpha``beta`"), [
    { kind: "literal", text: "alpha" },
    { kind: "literal", text: "beta" },
  ]);
});

test("guided literal parser preserves text around literals for glossary segmentation", () => {
  assert.deepEqual(segmentGuidedLiteralText("Ordner `ai-training-demo` im Explorer"), [
    { kind: "text", text: "Ordner " },
    { kind: "literal", text: "ai-training-demo" },
    { kind: "text", text: " im Explorer" },
  ]);
});

test("guided literal parser treats an unmatched backtick as text", () => {
  assert.deepEqual(segmentGuidedLiteralText("Tippe `Hello AI Training"), [
    { kind: "text", text: "Tippe `Hello AI Training" },
  ]);
});
