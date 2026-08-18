import { runtime, util } from "@aws-appsync/utils";

function identityPart(value) {
  return value === null ? "n" : `s${value.length}:${value}`;
}

function attestationId(subject, context) {
  const objectives = [...context.learningObjectiveIds].sort();
  return [
    "attestation:v2",
    `t:${identityPart(subject.tenantId)}`,
    `u:${identityPart(subject.userId)}`,
    `run:${identityPart(context.scenarioRunId)}`,
    `scenario:${identityPart(context.scenarioId)}`,
    `sv:${identityPart(context.scenarioVersion)}`,
    `product:${identityPart(context.productId)}`,
    `pv:${identityPart(context.productVersion)}`,
    `lo:${identityPart(objectives.join("\u001f"))}`,
  ].join("|");
}

function ownerKey(subject) {
  return [
    "attestation-owner:v1",
    util.base64Encode(subject.storageTenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validUntilIso(issuedIso) {
  const year = Number(issuedIso.slice(0, 4));
  const month = issuedIso.slice(5, 7);
  let day = issuedIso.slice(8, 10);
  const targetYear = year + 1;
  if (month === "02" && day === "29" && !isLeapYear(targetYear)) day = "28";
  return `${targetYear}-${month}-${day}${issuedIso.slice(10)}`;
}

function envelope(row, created) {
  return {
    created,
    reason: created ? "issued" : "already_exists",
    attestation: {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      scenarioId: row.scenarioId,
      scenarioVersion: row.scenarioVersion,
      productId: row.productId,
      productVersion: row.productVersion,
      learningObjectiveIds: row.learningObjectiveIds,
      issuedAt: row.issuedAt,
      validUntil: row.validUntil,
      sourceRevision: row.sourceRevision,
      scenarioRunId: row.scenarioRunId,
      sessionId: row.sessionId,
      evidence: row.evidence,
      provenance: row.provenance,
      signingStatus: row.signingStatus,
      signingAlgorithm: row.signingAlgorithm,
      signingKeyId: row.signingKeyId,
      signature: row.signature,
      validityStatus: "valid",
      recertificationRecommended: false,
    },
  };
}

export function request(ctx) {
  const run = ctx.stash.attestationRun;
  const context = ctx.stash.attestationContext;
  const subject = ctx.stash.attestationSubject;
  if (!run || !context || !subject) {
    util.error("Attestation pipeline state is incomplete", "AttestationPipelineError");
  }

  if (run.evidenceEligible !== true || run.evidenceStatus !== "eligible") {
    runtime.earlyReturn(
      { created: false, reason: "run_not_evidence_eligible", attestation: null },
      { skipTo: "END" },
    );
  }

  const issuedIso = util.time.nowISO8601();
  const issuedAt = util.time.parseISO8601ToEpochMilliSeconds(issuedIso);
  const validUntil = util.time.parseISO8601ToEpochMilliSeconds(validUntilIso(issuedIso));
  const id = attestationId(subject, context);
  const appendToken = util.autoId();
  const learningObjectiveIds = [...context.learningObjectiveIds].sort();
  const evidence = {
    scenarioRunId: context.scenarioRunId,
    sessionId: context.sessionId,
    sourceRevision: context.sourceRevision,
    challengeOutcome: context.challengeOutcome,
    evidenceStatus: run.evidenceStatus,
    evidenceEligible: run.evidenceEligible,
    learningObjectiveIds,
  };
  const provenance = {
    type: "authoritative-challenge-run",
    scenarioId: context.scenarioId,
    scenarioVersion: context.scenarioVersion,
    productId: context.productId,
    productVersion: context.productVersion,
    scenarioRunId: context.scenarioRunId,
    sessionId: context.sessionId,
    sourceRevision: context.sourceRevision,
  };

  ctx.stash.attestationAppendToken = appendToken;
  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues({
      ownerKey: ownerKey(subject),
      tenantId: subject.storageTenantId,
      userId: subject.userId,
      scenarioId: context.scenarioId,
      scenarioVersion: context.scenarioVersion,
      productId: context.productId,
      productVersion: context.productVersion,
      learningObjectiveIds,
      issuedAt,
      validUntil,
      sourceRevision: context.sourceRevision,
      scenarioRunId: context.scenarioRunId,
      sessionId: context.sessionId,
      evidence,
      provenance,
      signingStatus: "external_signature_required",
      signingAlgorithm: null,
      signingKeyId: null,
      signature: null,
      appendToken,
    }),
    condition: {
      expression: "attribute_not_exists(id)",
      equalsIgnore: ["appendToken", "issuedAt", "validUntil"],
      consistentRead: true,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const row = ctx.result;
  if (!row) util.error("Persisted attestation is invalid", "AttestationPersistenceError");
  return envelope(row, row.appendToken === ctx.stash.attestationAppendToken);
}
