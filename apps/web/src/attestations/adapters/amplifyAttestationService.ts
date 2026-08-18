import { generateClient } from "aws-amplify/data";
import {
  ATTESTATION_SCHEMA_VERSION,
  type AttestationExport,
  type AttestationExportFormat,
  type AttestationIssueResult,
  type AttestationService,
  type AttestationSignature,
  type AttestationView,
} from "@ai-train-lab/training-engine";
import type { Schema } from "../../../../../amplify/data/resource";

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data attestation error";
  const messages = errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean);
  return messages.join("; ") || "Unknown Amplify Data attestation error";
}

function objectValue(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Attestation ${fieldName} is invalid`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Attestation ${fieldName} is invalid`);
  }
  return value;
}

function optionalString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  return stringValue(value, fieldName);
}

function finiteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Attestation ${fieldName} is invalid`);
  }
  return value;
}

function stringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Attestation ${fieldName} is invalid`);
  }
  const result = value.map((entry, index) => stringValue(entry, `${fieldName}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`Attestation ${fieldName} is invalid`);
  return result;
}

function signature(source: Record<string, unknown>): AttestationSignature {
  const status = source["signingStatus"];
  if (status !== "signed" && status !== "external_signature_required") {
    throw new Error("Attestation signingStatus is invalid");
  }
  return {
    status,
    algorithm: optionalString(source["signingAlgorithm"], "signingAlgorithm"),
    keyId: optionalString(source["signingKeyId"], "signingKeyId"),
    value: optionalString(source["signature"], "signature"),
  };
}

function view(value: unknown): AttestationView {
  const source = objectValue(value, "payload");
  const id = stringValue(source["id"], "id");
  const userId = stringValue(source["userId"], "userId");
  const persistedTenantId = stringValue(source["tenantId"], "tenantId");
  const validityStatus = source["validityStatus"];
  if (validityStatus !== "valid" && validityStatus !== "expired") {
    throw new Error("Attestation validityStatus is invalid");
  }
  const sourceRevision = finiteNumber(source["sourceRevision"], "sourceRevision");
  if (!Number.isInteger(sourceRevision) || sourceRevision < 1) {
    throw new Error("Attestation sourceRevision is invalid");
  }

  const evidenceSource = objectValue(source["evidence"], "evidence");
  const evidenceStatus = evidenceSource["evidenceStatus"];
  const challengeOutcome = evidenceSource["challengeOutcome"];
  if (evidenceStatus !== "eligible" || challengeOutcome !== "passed") {
    throw new Error("Attestation evidence is not authoritative eligible challenge evidence");
  }
  const learningObjectiveIds = stringArray(source["learningObjectiveIds"], "learningObjectiveIds");
  const evidenceObjectiveIds = stringArray(
    evidenceSource["learningObjectiveIds"],
    "evidence.learningObjectiveIds",
  );
  if (learningObjectiveIds.join("\u001f") !== evidenceObjectiveIds.join("\u001f")) {
    throw new Error("Attestation objective evidence does not match the persisted objective set");
  }

  return {
    schemaVersion: ATTESTATION_SCHEMA_VERSION,
    id,
    deduplicationKey: id,
    subject: {
      userId,
      tenantId: id.startsWith("attestation:v2|t:n|") ? null : persistedTenantId,
    },
    scenarioId: stringValue(source["scenarioId"], "scenarioId"),
    scenarioVersion: stringValue(source["scenarioVersion"], "scenarioVersion"),
    productId: stringValue(source["productId"], "productId"),
    productVersion: stringValue(source["productVersion"], "productVersion"),
    learningObjectiveIds,
    issuedAt: finiteNumber(source["issuedAt"], "issuedAt"),
    validUntil: finiteNumber(source["validUntil"], "validUntil"),
    sourceRevision,
    evidence: {
      scenarioRunId: stringValue(evidenceSource["scenarioRunId"], "evidence.scenarioRunId"),
      sessionId: stringValue(evidenceSource["sessionId"], "evidence.sessionId"),
      sourceRevision: finiteNumber(evidenceSource["sourceRevision"], "evidence.sourceRevision"),
      challengeOutcome: "passed",
      evidenceStatus: "eligible",
      learningObjectiveIds: evidenceObjectiveIds,
    },
    signature: signature(source),
    validityStatus,
    recertificationRecommended: source["recertificationRecommended"] === true,
  };
}

function issueResult(value: unknown): AttestationIssueResult {
  const source = objectValue(value, "issue result");
  const reason = source["reason"];
  if (
    reason !== "issued" &&
    reason !== "already_exists" &&
    reason !== "run_not_evidence_eligible"
  ) {
    throw new Error("Attestation issue reason is invalid");
  }
  const data = source["attestation"];
  return {
    created: source["created"] === true,
    reason,
    attestation: data === null || data === undefined ? null : view(data),
  };
}

function exportFormat(value: unknown): AttestationExportFormat {
  if (value === "PDF" || value === "CSV") return value;
  throw new Error("Attestation export format is invalid");
}

function exportValue(value: unknown): AttestationExport {
  const source = objectValue(value, "export");
  return {
    attestationId: stringValue(source["attestationId"], "export.attestationId"),
    format: exportFormat(source["format"]),
    filename: stringValue(source["filename"], "export.filename"),
    mimeType: stringValue(source["mimeType"], "export.mimeType"),
    contentBase64: stringValue(source["contentBase64"], "export.contentBase64"),
    signature: signature(source),
  };
}

export function createAmplifyAttestationServiceWithClient(
  client: ReturnType<typeof generateClient<Schema>>,
): AttestationService {
  return {
    async issueChallenge(request): Promise<AttestationIssueResult> {
      const result = await client.mutations.issueChallengeAttestation({ scenarioId: request.scenarioId });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (!result.data) throw new Error("Server returned no attestation issue result");
      return issueResult(result.data);
    },

    async listAttestations(limit) {
      const result = await client.queries.listMyAttestations(limit === undefined ? {} : { limit });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      const attestations: AttestationView[] = [];
      for (const value of result.data ?? []) {
        if (value) attestations.push(view(value));
      }
      return attestations;
    },

    async exportAttestation(attestationId, format) {
      const result = await client.queries.exportMyAttestation({ attestationId, format });
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (!result.data) throw new Error("Server returned no attestation export");
      return exportValue(result.data);
    },
  };
}

export function createAmplifyAttestationService(): AttestationService {
  return createAmplifyAttestationServiceWithClient(generateClient<Schema>());
}
