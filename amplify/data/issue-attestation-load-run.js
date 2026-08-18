import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const context = ctx.stash.attestationContext;
  if (!context || typeof context.scenarioRunId !== "string") {
    util.error("Attestation pipeline state is incomplete", "AttestationPipelineError");
  }
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: context.scenarioRunId }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const run = ctx.result;
  if (!run) {
    util.error("Authoritative ScenarioRun evidence is required", "AttestationEligibilityError");
  }

  const subject = ctx.stash.attestationSubject;
  const context = ctx.stash.attestationContext;
  if (
    run.tenantId !== subject.storageTenantId ||
    run.userId !== subject.userId ||
    run.id !== context.scenarioRunId ||
    run.scenarioId !== context.scenarioId ||
    run.scenarioVersion !== context.scenarioVersion ||
    run.sessionId !== context.sessionId ||
    run.mode !== "challenge" ||
    run.sourceRevision !== context.sourceRevision
  ) {
    util.error("ScenarioRun evidence scope mismatch", "AttestationEligibilityError");
  }

  ctx.stash.attestationRun = run;
  return run;
}
