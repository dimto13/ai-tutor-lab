import assert from "node:assert/strict";
import test from "node:test";
import {
  diagnoseLocalRoute,
  diagnoseModelCompletion,
} from "../../scripts/tutor-quality-diagnostics.ts";

const allowedUiTargetRefs = ["vscode.activityBar.explorer"];
const example = (changes: Record<string, unknown> = {}) =>
  JSON.stringify({
    intent: "learning_help",
    confidence: "high",
    answer: "Ein Hinweis zur Aufgabe.",
    kind: "explanation",
    uiTargetRefs: [],
    ...changes,
  });
const record = (
  rawText: string | null,
  answer: {
    status: "ok" | "guardrail" | "provider_error";
    intent?: "learning_help" | "unclear";
  } | null,
) =>
  diagnoseModelCompletion({
    rawText,
    answer,
    expectedIntent: "learning_help",
    allowedUiTargetRefs,
  });

test("#575 diagnostics: a valid model choice is separately accepted by service", () => {
  const result = record(example(), { status: "ok", intent: "learning_help" });
  assert.equal(result.rawIntentPass, true);
  assert.equal(result.acceptedIntentPass, true);
  assert.equal(result.rawSchemaValid, true);
  assert.equal(result.reason, "accepted");
});

test("#575 diagnostics: low confidence preserves raw model intent but not accepted route", () => {
  const result = record(example({ confidence: "low" }), { status: "ok", intent: "unclear" });
  assert.equal(result.rawIntentPass, true);
  assert.equal(result.acceptedIntentPass, false);
  assert.equal(result.reason, "low_confidence");
});

test("#575 diagnostics: forged UI reference is not mistaken for wrong intent", () => {
  const result = record(example({ kind: "ui_action", uiTargetRefs: ["nonexistent.button"] }), {
    status: "guardrail",
  });
  assert.equal(result.rawIntentPass, true);
  assert.equal(result.rawSchemaValid, true);
  assert.equal(result.acceptedIntentPass, false);
  assert.equal(result.reason, "unknown_ui_ref");
});

test("#575 diagnostics: missing and duplicate UI references are separate safety failures", () => {
  assert.equal(
    record(example({ kind: "ui_action" }), { status: "guardrail" }).reason,
    "missing_action_ref",
  );
  assert.equal(
    record(
      example({
        kind: "ui_action",
        uiTargetRefs: [allowedUiTargetRefs[0], allowedUiTargetRefs[0]],
      }),
      { status: "guardrail" },
    ).reason,
    "duplicate_ui_refs",
  );
});

test("#575 diagnostics: conflicting feedback kind is separate from raw intent", () => {
  const result = record(example({ kind: "feedback" }), { status: "guardrail" });
  assert.equal(result.rawIntentPass, true);
  assert.equal(result.reason, "intent_kind_conflict");
});

test("#575 diagnostics: post-route guardrail remains visible", () => {
  const result = record(example({ answer: "Klicke danach irgendwo." }), { status: "guardrail" });
  assert.equal(result.rawSchemaValid, true);
  assert.equal(result.reason, "post_route_guardrail");
});

test("#575 diagnostics: invalid JSON and schema preserve a fail-closed denominator", () => {
  const invalidJson = record("not a JSON object", { status: "guardrail" });
  assert.equal(invalidJson.rawIntent, null);
  assert.equal(invalidJson.rawIntentPass, false);
  assert.equal(invalidJson.reason, "invalid_json");
  const invalidSchema = record(example({ extra: "unapproved" }), { status: "guardrail" });
  assert.equal(invalidSchema.rawIntentPass, true);
  assert.equal(invalidSchema.rawSchemaValid, false);
  assert.equal(invalidSchema.reason, "invalid_schema");
  assert.equal(record(null, { status: "provider_error" }).reason, "provider_error");
});

test("#575 diagnostics: local route evidence reports precise reasons without raw headers", () => {
  const base = {
    requests: 1,
    via: null,
    account: "local",
    route: "local:gemma4:e4b",
    rawModel: "gemma4:e4b",
    expectedModel: "gemma4:e4b",
    rawResponseReceived: true,
  };
  assert.deepEqual(diagnoseLocalRoute(base), []);
  assert.deepEqual(
    diagnoseLocalRoute({
      ...base,
      requests: 2,
      via: "forwarded",
      account: "other",
      route: "cloud:model",
      rawModel: "wrong-model",
    }),
    [
      "request_count_not_one",
      "via_header_present",
      "nonlocal_account_header",
      "nonlocal_route_header",
      "model_mismatch",
    ],
  );
  assert.deepEqual(diagnoseLocalRoute({ ...base, rawResponseReceived: false, rawModel: null }), [
    "provider_response_missing",
  ]);
});

test("#575 diagnostics: public diagnosis never exposes the raw completion body", () => {
  const sensitive = "PRIVATE_QUESTION_OR_ANSWER_TEXT";
  const result = record(example({ answer: sensitive }), { status: "ok", intent: "learning_help" });
  assert.equal(JSON.stringify(result).includes(sensitive), false);
});
