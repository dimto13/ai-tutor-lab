import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BETA_ACCESS_DENIED_MARKER,
  isBetaAllowed,
  normalizeBetaEmail,
  parseBetaAllowlist,
} from "../../amplify/auth/beta-access.js";

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

test("pre-sign-up rejects a denied identity before account creation with no client authority", async () => {
  const authResource = await readFile("amplify/auth/resource.ts", "utf8");
  const source = await readFile("amplify/auth/pre-sign-up/handler.js", "utf8");

  assert.equal(BETA_ACCESS_DENIED_MARKER, "BETA_ACCESS_DENIED");
  assert.match(authResource, /preSignUp:\s*betaPreSignUp/);
  assert.match(source, /isBetaAllowed\(email, process\.env\.BETA_ALLOWED_EMAILS\)/);
  assert.match(source, /throw new Error\(BETA_ACCESS_DENIED_MARKER\)/);
  assert.doesNotMatch(source, /localStorage|clientParameter|queryString/i);
  assert.doesNotMatch(source, /console\.(warn|error)\([^)]*allowlist/i);
});

test("post-confirmation rechecks beta access before any Cognito group mutation", async () => {
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

test("web auth maps beta denial to a stable non-provider user message", async () => {
  const source = await readFile("apps/web/src/auth/adapters/cognitoAuthService.ts", "utf8");

  assert.match(source, /BETA_ACCESS_DENIED_MARKER = "BETA_ACCESS_DENIED"/);
  assert.match(
    source,
    /Diese geschlossene Beta ist aktuell nur für eingeladene Tester verfügbar\./,
  );
  assert.match(source, /message\.includes\(BETA_ACCESS_DENIED_MARKER\)/);
});
