import assert from "node:assert/strict";
import test from "node:test";
import { userPreferencesOperationError } from "../src/profile/userPreferencesErrors.ts";

const technicalGraphQlFailure = new Error(
  "Expected JSON object for '$[condition]' but got a 'STRING' instead.",
);

test("preference save failures expose a user-oriented message while retaining the technical cause", () => {
  const error = userPreferencesOperationError("save", technicalGraphQlFailure);

  assert.equal(
    error.message,
    "Die Lernpräferenzen konnten nicht gespeichert werden. Bitte versuche es erneut.",
  );
  assert.equal(error.cause, technicalGraphQlFailure);
  assert.doesNotMatch(error.message, /JSON|GraphQL|AppSync|resolver|schema|condition/i);
});

test("preference load failures expose a user-oriented message while retaining the technical cause", () => {
  const error = userPreferencesOperationError("load", technicalGraphQlFailure);

  assert.equal(
    error.message,
    "Die Lernpräferenzen konnten nicht geladen werden. Bitte versuche es erneut.",
  );
  assert.equal(error.cause, technicalGraphQlFailure);
  assert.doesNotMatch(error.message, /JSON|GraphQL|AppSync|resolver|schema|condition/i);
});
