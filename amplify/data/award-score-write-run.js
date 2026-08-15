import { util } from "@aws-appsync/utils";

const SCENARIO_RUN_DEFINITIONS = {
  "vscode-basics.explore": {
    mode: "explore",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
  "vscode-basics.guided": {
    mode: "guided",
    version: "1",
    estimatedMinutes: 14,
    fastRunThresholdRatio: 0.25,
  },
  "vscode-basics.challenge": {
    mode: "challenge",
    version: "1",
    estimatedMinutes: 8,
    fastRunThresholdRatio: 0.25,
  },
  "vscode-shortcuts.challenge": {
    mode: "challenge",
    version: "1",
    estimatedMinutes: 2,
    fastRunThresholdRatio: null,
  },
  "developer-workflow-basics.explore": {
    mode: "explore",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
  "git-basics": { mode: "guided", version: "1", estimatedMinutes: 17, fastRunThresholdRatio: 0.25 },
  "developer-workflow-basics.challenge": {
    mode: "challenge",
    version: "1",
    estimatedMinutes: 12,
    fastRunThresholdRatio: 0.25,
  },
  "claude-code-basics.guided": {
    mode: "guided",
    version: "1",
    estimatedMinutes: 8,
    fastRunThresholdRatio: 0.25,
  },
  "copilot-basics.explore": {
    mode: "explore",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
  "copilot-basics.guided": {
    mode: "guided",
    version: "1",
    estimatedMinutes: 16,
    fastRunThresholdRatio: 0.25,
  },
  "copilot-basics.challenge": {
    mode: "challenge",
    version: "1",
    estimatedMinutes: 8,
    fastRunThresholdRatio: 0.25,
  },
  "artifact-preview-foundation.guided": {
    mode: "guided",
    version: "1",
    estimatedMinutes: 5,
    fastRunThresholdRatio: 0.25,
  },
  "html-page-workflow.explore": {
    mode: "explore",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
  "html-page-workflow.guided": {
    mode: "guided",
    version: "1",
    estimatedMinutes: 18,
    fastRunThresholdRatio: 0.25,
  },
  "html-page-workflow.challenge": {
    mode: "challenge",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
  "research-workflow.explore": {
    mode: "explore",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
  "research-workflow.guided": {
    mode: "guided",
    version: "1",
    estimatedMinutes: 18,
    fastRunThresholdRatio: 0.25,
  },
  "research-workflow.challenge": {
    mode: "challenge",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
  "source-control-platform-basics.explore": {
    mode: "explore",
    version: "1",
    estimatedMinutes: 12,
    fastRunThresholdRatio: 0.25,
  },
  "source-control-platform-basics.guided": {
    mode: "guided",
    version: "1",
    estimatedMinutes: 18,
    fastRunThresholdRatio: 0.25,
  },
  "source-control-platform-basics.challenge": {
    mode: "challenge",
    version: "1",
    estimatedMinutes: 10,
    fastRunThresholdRatio: 0.25,
  },
};

function runDefinition(ctx) {
  const definition = SCENARIO_RUN_DEFINITIONS[ctx.args.scenarioId];
  if (!definition || definition.mode !== ctx.args.mode) {
    util.error("Scenario is not registered for server-side run evidence", "RunDefinitionError");
  }
  return definition;
}

function identityPart(value) {
  return value === null ? "n" : `s${value.length}:${value}`;
}

function scenarioRunId(
  subject,
  scenarioId,
  scenarioVersion,
  startedAt,
  finishedAt,
  sourceRevision,
) {
  return [
    "scenario-run:v1",
    `t:${identityPart(subject.tenantId)}`,
    `u:${identityPart(subject.userId)}`,
    `s:${identityPart(scenarioId)}`,
    `v:${identityPart(scenarioVersion)}`,
    `a:${startedAt}`,
    `z:${finishedAt}`,
    `r:${sourceRevision}`,
  ].join("|");
}

function runOwnerKey(subject) {
  return [
    "run-owner:v1",
    util.base64Encode(subject.storageTenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

function timingEvidence(payload, definition) {
  const startedAt = payload.startedAt;
  const finishedAt = payload.finishedAt;
  if (
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    startedAt < 0 ||
    typeof finishedAt !== "number" ||
    !Number.isFinite(finishedAt) ||
    finishedAt < startedAt
  ) {
    util.error("Training session has invalid timing evidence", "RunEvidenceError");
  }

  const durationMs = finishedAt - startedAt;
  if (definition.fastRunThresholdRatio === null || definition.estimatedMinutes === null) {
    return {
      startedAt,
      finishedAt,
      durationMs,
      estimatedMinutes: definition.estimatedMinutes,
      fastRunThresholdRatio: definition.fastRunThresholdRatio,
      fastRunThresholdMs: null,
      evidenceStatus: "unassessed",
      evidenceEligible: false,
    };
  }

  const fastRunThresholdMs =
    definition.estimatedMinutes * 60_000 * definition.fastRunThresholdRatio;
  const suspectFast = durationMs < fastRunThresholdMs;
  return {
    startedAt,
    finishedAt,
    durationMs,
    estimatedMinutes: definition.estimatedMinutes,
    fastRunThresholdRatio: definition.fastRunThresholdRatio,
    fastRunThresholdMs,
    evidenceStatus: suspectFast ? "suspect_fast" : "eligible",
    evidenceEligible: !suspectFast,
  };
}

export function request(ctx) {
  const definition = runDefinition(ctx);
  const subject = ctx.stash.scoreSubject;
  const session = ctx.stash.scoreSession;
  if (!subject || !session) {
    util.error("Score pipeline state is incomplete", "ScorePipelineError");
  }

  const payload = session.payload;
  if (typeof payload.id !== "string" || payload.id.length === 0) {
    util.error("Training session has no audit id", "RunEvidenceError");
  }

  const evidence = timingEvidence(payload, definition);
  const id = scenarioRunId(
    subject,
    ctx.args.scenarioId,
    definition.version,
    evidence.startedAt,
    evidence.finishedAt,
    session.revision,
  );
  const appendToken = util.autoId();
  const values = {
    ownerKey: runOwnerKey(subject),
    tenantId: subject.storageTenantId,
    userId: subject.userId,
    scenarioId: ctx.args.scenarioId,
    scenarioVersion: definition.version,
    sessionId: payload.id,
    mode: ctx.args.mode,
    startedAt: evidence.startedAt,
    finishedAt: evidence.finishedAt,
    durationMs: evidence.durationMs,
    estimatedMinutes: evidence.estimatedMinutes,
    fastRunThresholdRatio: evidence.fastRunThresholdRatio,
    fastRunThresholdMs: evidence.fastRunThresholdMs,
    evidenceStatus: evidence.evidenceStatus,
    evidenceEligible: evidence.evidenceEligible,
    sourceRevision: session.revision,
    appendToken,
  };

  ctx.stash.scenarioRunId = id;
  ctx.stash.scenarioRunAppendToken = appendToken;

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues(values),
    condition: {
      expression: "attribute_not_exists(id)",
      equalsIgnore: ["appendToken"],
      consistentRead: true,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const run = ctx.result;
  if (!run) util.error("Persisted scenario run is invalid", "RunPersistenceError");

  ctx.stash.scenarioRun = {
    id: ctx.stash.scenarioRunId,
    created: run.appendToken === ctx.stash.scenarioRunAppendToken,
    evidenceStatus: run.evidenceStatus,
    evidenceEligible: run.evidenceEligible,
  };
  return run;
}
