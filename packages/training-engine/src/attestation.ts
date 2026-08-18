import type { TrainingSubjectRef } from "./stateMachine.ts";

export const ATTESTATION_SCHEMA_VERSION = 2 as const;
export const ATTESTATION_VALIDITY_MONTHS = 12 as const;

export type AttestationValidityStatus = "valid" | "expired";
export type AttestationSigningStatus = "signed" | "external_signature_required";
export type AttestationExportFormat = "PDF" | "CSV";

export interface AttestationEvidence {
  scenarioRunId: string;
  sessionId: string;
  sourceRevision: number;
  challengeOutcome: "passed";
  evidenceStatus: "eligible";
  learningObjectiveIds: readonly string[];
}

export interface AttestationSignature {
  status: AttestationSigningStatus;
  algorithm: string | null;
  keyId: string | null;
  value: string | null;
}

export interface CompetenceAttestation {
  schemaVersion: typeof ATTESTATION_SCHEMA_VERSION;
  id: string;
  deduplicationKey: string;
  subject: TrainingSubjectRef;
  scenarioId: string;
  scenarioVersion: string;
  productId: string;
  productVersion: string;
  learningObjectiveIds: readonly string[];
  issuedAt: number;
  validUntil: number;
  sourceRevision: number;
  evidence: AttestationEvidence;
  signature: AttestationSignature;
}

export interface AttestationView extends CompetenceAttestation {
  validityStatus: AttestationValidityStatus;
  recertificationRecommended: boolean;
}

export interface AttestationIssueResult {
  created: boolean;
  reason: "issued" | "already_exists" | "run_not_evidence_eligible";
  attestation: AttestationView | null;
}

export interface AttestationExport {
  attestationId: string;
  format: AttestationExportFormat;
  filename: string;
  mimeType: string;
  contentBase64: string;
  signature: AttestationSignature;
}

/** Minimal command: owner, evidence, objectives, versions and validity remain server-owned. */
export interface ChallengeAttestationRequest {
  scenarioId: string;
}

/** Cloud-neutral application port. AWS/Amplify is an adapter behind this contract. */
export interface AttestationService {
  issueChallenge(request: ChallengeAttestationRequest): Promise<AttestationIssueResult>;
  listAttestations(limit?: number): Promise<AttestationView[]>;
  exportAttestation(
    attestationId: string,
    format: AttestationExportFormat,
  ): Promise<AttestationExport>;
}

/**
 * Cryptographic signing boundary for a future server-side key/KMS adapter. Implementations must
 * return a real asymmetric/MAC signature produced with protected key material. A digest, Base64
 * encoding or drawn signature image is not a signature and must not implement this port.
 */
export interface AttestationSigner {
  sign(canonicalPayload: string): Promise<{
    algorithm: string;
    keyId: string;
    value: string;
  }>;
}

export interface AttestationIdentityInput {
  subject: TrainingSubjectRef;
  scenarioRunId: string;
  scenarioId: string;
  scenarioVersion: string;
  productId: string;
  productVersion: string;
  learningObjectiveIds: readonly string[];
}

function identityPart(value: string | null): string {
  return value === null ? "n" : `s${value.length}:${value}`;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0 || value !== value.trim())
    throw new Error(`${field} must be a non-empty id`);
}

export function normalizeLearningObjectiveIds(ids: readonly string[]): string[] {
  if (ids.length === 0) throw new Error("At least one learning objective is required");
  const normalized = [...ids];
  const seen = new Set<string>();
  for (const id of normalized) {
    assertNonEmpty(id, "learningObjectiveId");
    if (seen.has(id)) throw new Error(`Duplicate learning objective ${id}`);
    seen.add(id);
  }
  return normalized.sort((left, right) => left.localeCompare(right));
}

/** Stable retry identity for exactly one authoritative eligible ScenarioRun and objective set. */
export function createAttestationId(input: AttestationIdentityInput): string {
  assertNonEmpty(input.subject.userId, "subject.userId");
  if (input.subject.tenantId !== null) assertNonEmpty(input.subject.tenantId, "subject.tenantId");
  assertNonEmpty(input.scenarioRunId, "scenarioRunId");
  assertNonEmpty(input.scenarioId, "scenarioId");
  assertNonEmpty(input.scenarioVersion, "scenarioVersion");
  assertNonEmpty(input.productId, "productId");
  assertNonEmpty(input.productVersion, "productVersion");
  const objectives = normalizeLearningObjectiveIds(input.learningObjectiveIds);

  return [
    "attestation:v2",
    `t:${identityPart(input.subject.tenantId)}`,
    `u:${identityPart(input.subject.userId)}`,
    `run:${identityPart(input.scenarioRunId)}`,
    `scenario:${identityPart(input.scenarioId)}`,
    `sv:${identityPart(input.scenarioVersion)}`,
    `product:${identityPart(input.productId)}`,
    `pv:${identityPart(input.productVersion)}`,
    `lo:${identityPart(objectives.join("\u001f"))}`,
  ].join("|");
}

/** Add 12 calendar months with end-of-month clamping (for example leap-day -> 28 February). */
export function calculateAttestationValidUntil(issuedAt: number): number {
  if (!Number.isFinite(issuedAt) || issuedAt < 0)
    throw new Error("issuedAt must be a valid epoch ms");
  const issued = new Date(issuedAt);
  if (Number.isNaN(issued.getTime())) throw new Error("issuedAt must be a valid epoch ms");

  const targetYear = issued.getUTCFullYear() + 1;
  const targetMonth = issued.getUTCMonth();
  const sourceDay = issued.getUTCDate();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(sourceDay, lastDay),
    issued.getUTCHours(),
    issued.getUTCMinutes(),
    issued.getUTCSeconds(),
    issued.getUTCMilliseconds(),
  );
}

export function attestationValidityStatus(
  validUntil: number,
  now = Date.now(),
): AttestationValidityStatus {
  if (!Number.isFinite(validUntil) || validUntil < 0) throw new Error("validUntil must be valid");
  if (!Number.isFinite(now) || now < 0) throw new Error("now must be valid");
  return now < validUntil ? "valid" : "expired";
}

export function withAttestationValidity(
  attestation: CompetenceAttestation,
  now = Date.now(),
): AttestationView {
  const validityStatus = attestationValidityStatus(attestation.validUntil, now);
  return {
    ...attestation,
    validityStatus,
    recertificationRecommended: validityStatus === "expired",
  };
}

/** Stable payload supplied to a real signer; intentionally excludes mutable display state. */
export function canonicalAttestationSigningPayload(attestation: CompetenceAttestation): string {
  return JSON.stringify({
    schemaVersion: attestation.schemaVersion,
    id: attestation.id,
    tenantId: attestation.subject.tenantId,
    userId: attestation.subject.userId,
    scenarioId: attestation.scenarioId,
    scenarioVersion: attestation.scenarioVersion,
    productId: attestation.productId,
    productVersion: attestation.productVersion,
    learningObjectiveIds: normalizeLearningObjectiveIds(attestation.learningObjectiveIds),
    issuedAt: attestation.issuedAt,
    validUntil: attestation.validUntil,
    sourceRevision: attestation.sourceRevision,
    evidence: {
      scenarioRunId: attestation.evidence.scenarioRunId,
      sessionId: attestation.evidence.sessionId,
      sourceRevision: attestation.evidence.sourceRevision,
      challengeOutcome: attestation.evidence.challengeOutcome,
      evidenceStatus: attestation.evidence.evidenceStatus,
      learningObjectiveIds: normalizeLearningObjectiveIds(
        attestation.evidence.learningObjectiveIds,
      ),
    },
  });
}
