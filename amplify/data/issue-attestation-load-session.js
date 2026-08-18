import { util } from "@aws-appsync/utils";

const ATTESTATION_DEFINITIONS = {};

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

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

  return {
    userId: identity.sub,
    tenantId,
    storageTenantId: tenantId || `personal:${identity.sub}`,
  };
}

function identityPart(value) {
  return value === null ? "n" : `s${value.length}:${value}`;
}

function sessionId(subject, scenarioId) {
  return [
    "session",
    util.base64Encode(subject.storageTenantId),
    util.base64Encode(subject.userId),
    util.base64Encode(scenarioId),
    "challenge",
  ].join(".");
}

function scenarioRunId(subject, definition, scenarioId, payload, sourceRevision) {
  return [
    "scenario-run:v1",
    `t:${identityPart(subject.tenantId)}`,
    `u:${identityPart(subject.userId)}`,
    `s:${identityPart(scenarioId)}`,
    `v:${identityPart(definition.scenarioVersion)}`,
    `a:${payload.startedAt}`,
    `z:${payload.finishedAt}`,
    `r:${sourceRevision}`,
  ].join("|");
}

function definitionFor(ctx) {
  const scenarioId = ctx.args.scenarioId;
  if (typeof scenarioId !== "string" || scenarioId.length === 0) {
    util.error("scenarioId is required", "AttestationRequestError");
  }
  const definition = ATTESTATION_DEFINITIONS[scenarioId];
  if (!definition || definition.mode !== "challenge") {
    util.error("Scenario is not registered for challenge attestation", "AttestationDefinitionError");
  }
  if (
    !definition.learningObjectiveIds ||
    typeof definition.learningObjectiveIds.length !== "number" ||
    definition.learningObjectiveIds.length === 0
  ) {
    util.error("Challenge has no authoritative learning objectives", "AttestationDefinitionError");
  }
  return definition;
}

export function request(ctx) {
  const subject = caller(ctx);
  const definition = definitionFor(ctx);
  ctx.stash.attestationSubject = subject;
  ctx.stash.attestationDefinition = definition;

  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: sessionId(subject, ctx.args.scenarioId) }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const row = ctx.result;
  if (!row) {
    util.error("A persisted challenge session is required", "AttestationEligibilityError");
  }

  const subject = ctx.stash.attestationSubject;
  if (
    row.tenantId !== subject.storageTenantId ||
    row.userId !== subject.userId ||
    row.scenarioId !== ctx.args.scenarioId ||
    row.mode !== "challenge"
  ) {
    util.error("Challenge session ownership or scope mismatch", "AttestationEligibilityError");
  }

  const payload = row.payload;
  if (!payload || typeof payload !== "object") {
    util.error("Challenge session payload is invalid", "AttestationEligibilityError");
  }
  if (payload.scenarioId !== ctx.args.scenarioId || payload.mode !== "challenge") {
    util.error("Challenge session payload scope mismatch", "AttestationEligibilityError");
  }
  if (typeof payload.finishedAt !== "number" || payload.finishedAt <= 0) {
    util.error("Challenge is not completed", "AttestationEligibilityError");
  }
  if (payload.challengeOutcome !== "passed") {
    util.error("Only passed challenges can produce attestations", "AttestationEligibilityError");
  }
  if (typeof payload.startedAt !== "number" || payload.startedAt < 0) {
    util.error("Challenge has invalid run evidence", "AttestationEligibilityError");
  }

  const definition = ctx.stash.attestationDefinition;
  const runId = scenarioRunId(subject, definition, ctx.args.scenarioId, payload, row.revision);
  ctx.stash.attestationContext = {
    scenarioRunId: runId,
    sessionId: payload.id,
    scenarioId: ctx.args.scenarioId,
    scenarioVersion: definition.scenarioVersion,
    productId: definition.productId,
    productVersion: definition.productVersion,
    learningObjectiveIds: definition.learningObjectiveIds,
    sourceRevision: row.revision,
    challengeOutcome: "passed",
  };
  return row;
}
