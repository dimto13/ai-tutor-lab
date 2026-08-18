import { util } from "@aws-appsync/utils";

function subject(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0)
    util.unauthorized();
  const groups = identity.groups || [];
  let tenantId = null;
  for (const group of groups) {
    if (typeof group === "string" && group.startsWith("tenant:")) {
      const candidate = group.slice("tenant:".length);
      if (candidate.length === 0) util.error("Invalid tenant membership", "TenantMembershipError");
      if (tenantId !== null && tenantId !== candidate) {
        util.error(
          "Multiple tenant memberships require explicit tenant selection",
          "TenantMembershipError",
        );
      }
      tenantId = candidate;
    }
  }
  return { userId: identity.sub, storageTenantId: tenantId || `personal:${identity.sub}` };
}

function ownerKey(value) {
  return [
    "attestation-owner:v1",
    util.base64Encode(value.storageTenantId),
    util.base64Encode(value.userId),
  ].join(".");
}

function requestedLimit(value) {
  if (value === undefined || value === null) return 100;
  if (typeof value !== "number" || value < 1 || value > 250 || Math.floor(value) !== value) {
    util.error("limit must be an integer between 1 and 250", "AttestationQueryError");
  }
  return value;
}

export function request(ctx) {
  const caller = subject(ctx);
  ctx.stash.attestationListSubject = caller;
  return {
    operation: "Query",
    index: "attestationsByOwnerTime",
    query: {
      expression: "ownerKey = :ownerKey",
      expressionValues: util.dynamodb.toMapValues({ ":ownerKey": ownerKey(caller) }),
    },
    limit: requestedLimit(ctx.args.limit),
    scanIndexForward: false,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const caller = ctx.stash.attestationListSubject;
  const now = util.time.nowEpochMilliSeconds();
  const result = [];
  for (const row of ctx.result.items || []) {
    if (row.tenantId !== caller.storageTenantId || row.userId !== caller.userId) {
      util.error("Attestation owner index returned foreign data", "AttestationIsolationError");
    }
    const expired = now >= row.validUntil;
    result.push({
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
      validityStatus: expired ? "expired" : "valid",
      recertificationRecommended: expired,
    });
  }
  return result;
}
