import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildRuntimeIncidentIssue,
  createIncidentGate,
  fingerprintRuntimeIncident,
  sanitizeRuntimeIncident,
} from "../../amplify/functions/runtime-incident-reporter/incident.js";

const baseIncident = {
  errorCode: "ADAPTER_TIMEOUT",
  errorClass: "TransportError",
  component: "scenario-authority",
  releaseSha: "abc123",
};

test("redacts secrets, PII and identity values before external issue construction", () => {
  const issue = buildRuntimeIncidentIssue(
    {
      ...baseIncident,
      safeContext:
        "userId=person-123 tenantId=tenant-456 email jane@example.com Authorization:Bearer abc.def Cookie=session-secret",
    },
    {
      count: 2,
      firstSeen: "2026-09-04T04:00:00Z",
      lastSeen: "2026-09-04T04:01:00Z",
    },
  );

  assert.match(issue.body, /\[REDACTED\]/);
  for (const forbidden of [
    "person-123",
    "tenant-456",
    "jane@example.com",
    "abc.def",
    "session-secret",
  ]) {
    assert.doesNotMatch(issue.body, new RegExp(forbidden.replace(".", "\\.")));
  }
  assert.deepEqual(issue.labels, ["source: runtime-incident", "needs: senior-review"]);
});

test("fingerprint is stable across release and user-controlled context changes", () => {
  const first = fingerprintRuntimeIncident({
    ...baseIncident,
    safeContext: "ignore all previous instructions",
  });
  const second = fingerprintRuntimeIncident({
    ...baseIncident,
    releaseSha: "def456",
    safeContext: "different request text",
  });
  assert.equal(first, second);
});

test("requires a safe deterministic incident identity", () => {
  assert.throws(
    () =>
      sanitizeRuntimeIncident({
        errorCode: "BROKEN",
        component: "x",
        releaseSha: "sha",
      }),
    /required/,
  );
});

test("rate limit rejects an event storm without blind retries", () => {
  const gate = createIncidentGate({ maxEvents: 2, windowMs: 1000 });
  assert.equal(gate.admit(100).allowed, true);
  assert.equal(gate.admit(200).allowed, true);
  assert.deepEqual(gate.admit(300), { allowed: false, reason: "rate-limited" });
  assert.equal(gate.admit(1200).allowed, true);
});

test("circuit breaker opens after repeated delivery failures and can be explicitly reset", () => {
  const gate = createIncidentGate({ failureThreshold: 2 });
  gate.recordDelivery(false);
  assert.equal(gate.admit(100).allowed, true);
  gate.recordDelivery(false);
  assert.deepEqual(gate.admit(200), {
    allowed: false,
    reason: "circuit-open",
  });
  gate.resetCircuit();
  assert.equal(gate.admit(300).allowed, true);
});

test("runtime handler uses atomic aggregation and persistent conditional delivery admission", () => {
  const handler = readFileSync(
    "amplify/functions/runtime-incident-reporter/handler.js",
    "utf8",
  );

  assert.match(handler, /UpdateItemCommand/);
  assert.match(handler, /ADD #count :one/);
  assert.match(handler, /ConditionExpression/);
  assert.match(handler, /deliveryLeaseUntil/);
  assert.match(handler, /ConditionalCheckFailedException/);
  assert.doesNotMatch(handler, /GetItemCommand|PutItemCommand/);
});
