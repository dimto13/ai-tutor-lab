import assert from "node:assert/strict";
import test from "node:test";
import { emailMaskRatio, maskEmailAddress } from "../src/auth/emailPrivacy.ts";

test("email masking hides about eighty percent of content characters", () => {
  const email = "learner@example.com";
  const masked = maskEmailAddress(email);
  const ratio = emailMaskRatio(email, masked);

  assert.notEqual(masked, email);
  assert.match(masked, /@/);
  assert.equal(masked.replace(/[\p{L}\p{N}*]/gu, ""), email.replace(/[\p{L}\p{N}]/gu, ""));
  assert.ok(ratio >= 0.75, `expected at least 75% masking, got ${ratio}`);
  assert.ok(ratio <= 0.9, `expected at most 90% masking, got ${ratio}`);
});

test("email masking is deterministic and preserves structural characters", () => {
  const email = "first.last+lab@example-company.de";
  const masked = maskEmailAddress(email);

  assert.equal(maskEmailAddress(email), masked);
  assert.equal(masked.includes("@"), true);
  assert.equal(masked.includes("."), true);
  assert.equal(masked.includes("+"), true);
  assert.equal(masked.includes("-"), true);
});
