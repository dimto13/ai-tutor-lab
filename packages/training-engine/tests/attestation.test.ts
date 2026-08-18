import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTESTATION_SCHEMA_VERSION,
  attestationValidityStatus,
  calculateAttestationValidUntil,
  canonicalAttestationSigningPayload,
  createAttestationId,
  normalizeLearningObjectiveIds,
  withAttestationValidity,
  type CompetenceAttestation,
} from "../src/attestation.ts";

const subject = { userId: "user-1", tenantId: "tenant-a" } as const;

function attestation(issuedAt: number): CompetenceAttestation {
  const learningObjectiveIds = ["lo-b", "lo-a"];
  const scenarioRunId = "scenario-run-1";
  const id = createAttestationId({
    subject,
    scenarioRunId,
    scenarioId: "generic.challenge",
    scenarioVersion: "3",
    productId: "generic-product",
    productVersion: "2026.08",
    learningObjectiveIds,
  });
  return {
    schemaVersion: ATTESTATION_SCHEMA_VERSION,
    id,
    deduplicationKey: id,
    subject,
    scenarioId: "generic.challenge",
    scenarioVersion: "3",
    productId: "generic-product",
    productVersion: "2026.08",
    learningObjectiveIds,
    issuedAt,
    validUntil: calculateAttestationValidUntil(issuedAt),
    sourceRevision: 7,
    evidence: {
      scenarioRunId,
      sessionId: "session-1",
      sourceRevision: 7,
      challengeOutcome: "passed",
      evidenceStatus: "eligible",
      learningObjectiveIds,
    },
    signature: {
      status: "external_signature_required",
      algorithm: null,
      keyId: null,
      value: null,
    },
  };
}

test("attestation id is stable for a retried authoritative run and objective ordering", () => {
  const common = {
    subject,
    scenarioRunId: "run-1",
    scenarioId: "generic.challenge",
    scenarioVersion: "1",
    productId: "product",
    productVersion: "v1",
  };
  assert.equal(
    createAttestationId({ ...common, learningObjectiveIds: ["lo-b", "lo-a"] }),
    createAttestationId({ ...common, learningObjectiveIds: ["lo-a", "lo-b"] }),
  );
});

test("different run, scenario version, product version or tenant produces a distinct attestation", () => {
  const base = {
    subject,
    scenarioRunId: "run-1",
    scenarioId: "generic.challenge",
    scenarioVersion: "1",
    productId: "product",
    productVersion: "v1",
    learningObjectiveIds: ["lo-a"],
  };
  const id = createAttestationId(base);
  assert.notEqual(createAttestationId({ ...base, scenarioRunId: "run-2" }), id);
  assert.notEqual(createAttestationId({ ...base, scenarioVersion: "2" }), id);
  assert.notEqual(createAttestationId({ ...base, productVersion: "v2" }), id);
  assert.notEqual(
    createAttestationId({ ...base, subject: { userId: "user-1", tenantId: "tenant-b" } }),
    id,
  );
  assert.notEqual(
    createAttestationId({ ...base, subject: { userId: "user-2", tenantId: "tenant-a" } }),
    id,
  );
});

test("learning objective set is non-empty, unique and canonical", () => {
  assert.deepEqual(normalizeLearningObjectiveIds(["b", "a"]), ["a", "b"]);
  assert.throws(() => normalizeLearningObjectiveIds([]), /At least one learning objective/);
  assert.throws(() => normalizeLearningObjectiveIds(["a", "a"]), /Duplicate learning objective/);
});

test("validity is exactly twelve calendar months and clamps leap day", () => {
  const issued = Date.UTC(2024, 1, 29, 12, 30, 15, 250);
  const validUntil = calculateAttestationValidUntil(issued);
  assert.equal(validUntil, Date.UTC(2025, 1, 28, 12, 30, 15, 250));
  assert.equal(attestationValidityStatus(validUntil, validUntil - 1), "valid");
  assert.equal(attestationValidityStatus(validUntil, validUntil), "expired");
});

test("expired attestations remain visible and recommend recertification", () => {
  const record = attestation(Date.UTC(2025, 0, 15));
  const active = withAttestationValidity(record, Date.UTC(2025, 6, 1));
  const expired = withAttestationValidity(record, Date.UTC(2026, 1, 1));
  assert.equal(active.validityStatus, "valid");
  assert.equal(active.recertificationRecommended, false);
  assert.equal(expired.validityStatus, "expired");
  assert.equal(expired.recertificationRecommended, true);
  assert.equal(expired.id, record.id);
});

test("canonical signing payload is deterministic and contains authoritative evidence", () => {
  const record = attestation(Date.UTC(2026, 0, 15));
  const first = canonicalAttestationSigningPayload(record);
  const second = canonicalAttestationSigningPayload({
    ...record,
    learningObjectiveIds: ["lo-a", "lo-b"],
    evidence: { ...record.evidence, learningObjectiveIds: ["lo-a", "lo-b"] },
  });
  assert.equal(first, second);
  const parsed = JSON.parse(first) as Record<string, unknown>;
  assert.equal(parsed["id"], record.id);
  assert.equal(parsed["scenarioVersion"], "3");
  assert.equal(parsed["productVersion"], "2026.08");
  assert.deepEqual(parsed["learningObjectiveIds"], ["lo-a", "lo-b"]);
  assert.match(first, /scenario-run-1/);
  assert.doesNotMatch(first, /external_signature_required/);
});
