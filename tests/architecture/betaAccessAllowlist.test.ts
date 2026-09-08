import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isBetaAllowed,
  normalizeBetaEmail,
  parseBetaAllowlist,
} from "../../amplify/auth/post-confirmation/beta-access.js";

test("beta allowlist normalizes owner-managed email entries", () => {
  assert.equal(normalizeBetaEmail(" Tester@Example.COM "), "tester@example.com");
  assert.deepEqual(
    [...parseBetaAllowlist(" first@example.com,SECOND@example.com, ,first@example.com ")],
    ["first@example.com", "second@example.com"],
  );
});

test("beta access fails closed for absent, empty, malformed or non-allowlisted identity", () => {
  assert.equal(isBetaAllowed(undefined, "tester@example.com"), false);
  assert.equal(isBetaAllowed("", "tester@example.com"), false);
  assert.equal(isBetaAllowed("other@example.com", undefined), false);
  assert.equal(isBetaAllowed("other@example.com", "tester@example.com"), false);
});

test("beta access admits an allowlisted tester independent of email casing", () => {
  assert.equal(isBetaAllowed("Tester@Example.com", "other@example.com, tester@example.COM"), true);
});

test("post-confirmation withholds tenant membership before any Cognito group mutation", async () => {
  const source = await readFile("amplify/auth/post-confirmation/handler.js", "utf8");
  const allowlistGate = source.indexOf("if (!isBetaAllowed(");
  const groupMutation = source.indexOf("new AdminAddUserToGroupCommand(");

  assert.ok(allowlistGate >= 0, "server-side allowlist gate must exist");
  assert.ok(
    groupMutation > allowlistGate,
    "tenant group mutation must occur only after allowlist gate",
  );
  assert.match(source, /triggerSource !== "PostConfirmation_ConfirmSignUp"/);
  assert.doesNotMatch(source, /localStorage|clientParameter|queryString/i);
});
