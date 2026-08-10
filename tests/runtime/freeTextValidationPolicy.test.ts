import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCompletionFreeTextPolicy,
  validateStepFreeTextPolicy,
} from "../../apps/web/src/scenarios/freeTextValidationPolicy.ts";

test("non-exact prompt substrings are rejected", () => {
  const violations = validateStepFreeTextPolicy({
    validation: {
      kind: "event",
      contains: { prompt: "Vergleichstabelle" },
    },
  });
  assert.equal(violations.length, 1);
});

test("exact free text remains possible when exact identity is the learning goal", () => {
  assert.deepEqual(
    validateStepFreeTextPolicy({
      exactTextValidation: true,
      validation: {
        kind: "event",
        contains: { prompt: "Nora Berger" },
      },
    }),
    [],
  );
});

test("non-text payload checks remain allowed", () => {
  assert.deepEqual(
    validateStepFreeTextPolicy({
      validation: {
        kind: "event",
        contains: { content: "Hello AI Training" },
      },
    }),
    [],
  );
});

test("completion validation rejects magic words in description state", () => {
  const violations = validateCompletionFreeTextPolicy({
    kind: "all",
    of: [
      {
        kind: "state",
        selector: "platform.pullRequest.description",
        includes: "geprüft",
      },
    ],
  });
  assert.equal(violations.length, 1);
});
