import { util } from "@aws-appsync/utils";

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
      if (candidate.length === 0) {
        util.error("Invalid tenant membership", "TenantMembershipError");
      }
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
    tenantId: tenantId || `personal:${identity.sub}`,
  };
}

function sessionId(subject, scenarioId, mode) {
  return [
    "session",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
    util.base64Encode(scenarioId),
    mode,
  ].join(".");
}

function assertScoreRequest(ctx) {
  if (typeof ctx.args.scenarioId !== "string" || ctx.args.scenarioId.length === 0) {
    util.error("scenarioId is required", "ScoreRequestError");
  }
  if (ctx.args.mode !== "explore" && ctx.args.mode !== "guided" && ctx.args.mode !== "challenge") {
    util.error("Unsupported training mode", "ScoreRequestError");
  }
}

export function request(ctx) {
  assertScoreRequest(ctx);
  const subject = caller(ctx);
  ctx.stash.scoreSubject = subject;

  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({
      id: sessionId(subject, ctx.args.scenarioId, ctx.args.mode),
    }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const row = ctx.result;
  if (!row) {
    util.error("A persisted training session is required before scoring", "ScoreEligibilityError");
  }

  const subject = ctx.stash.scoreSubject;
  if (
    row.tenantId !== subject.tenantId ||
    row.userId !== subject.userId ||
    row.scenarioId !== ctx.args.scenarioId ||
    row.mode !== ctx.args.mode
  ) {
    util.error("Training session ownership or scope mismatch", "ScoreEligibilityError");
  }

  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    util.error("Training session payload is invalid", "ScoreEligibilityError");
  }
  if (payload.scenarioId !== ctx.args.scenarioId || payload.mode !== ctx.args.mode) {
    util.error("Training session payload does not match the score request", "ScoreEligibilityError");
  }
  if (typeof payload.finishedAt !== "number" || payload.finishedAt <= 0) {
    util.error("Only completed training sessions can be scored", "ScoreEligibilityError");
  }

  if (ctx.args.mode === "challenge" && payload.challengeOutcome !== "passed") {
    util.error("Only passed challenges can be scored", "ScoreEligibilityError");
  }

  if (ctx.args.mode === "guided") {
    const statuses = payload.statuses;
    if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) {
      util.error("Guided training state has no valid step statuses", "ScoreEligibilityError");
    }
    const stepIds = Object.keys(statuses);
    if (stepIds.length === 0) {
      util.error("Guided training state has no scoring steps", "ScoreEligibilityError");
    }
    for (const stepId of stepIds) {
      const status = statuses[stepId];
      if (status !== "COMPLETED" && status !== "SKIPPED") {
        util.error("Guided training is not fully completed", "ScoreEligibilityError");
      }
    }
  }

  if (ctx.args.mode === "explore") {
    if (!Array.isArray(payload.exploredTargets) || payload.exploredTargets.length === 0) {
      util.error("Explore training has no completed exploration evidence", "ScoreEligibilityError");
    }
  }

  ctx.stash.scoreSession = {
    payload,
    revision: row.revision,
  };
  return row;
}
