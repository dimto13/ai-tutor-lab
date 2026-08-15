import { util } from "@aws-appsync/utils";

const SCORE_BASE_PERCENT = 70;
const SCORE_BONUS_PERCENT = 30;
const SCORE_EVENT_TYPE = "scenario.score.awarded";

const SCORE_MODE_MULTIPLIER = {
  explore: 0.5,
  guided: 1,
  challenge: 2,
};

const HELP_BONUS_DEDUCTION_PERCENT = {
  1: 10,
  2: 25,
  3: 50,
};

const SCENARIO_SCORE_DEFINITIONS = {
  "vscode-basics.explore": { mode: "explore", version: "1", points: 100 },
  "vscode-basics.guided": { mode: "guided", version: "1", points: 100 },
  "vscode-basics.challenge": { mode: "challenge", version: "1", points: 100 },
  "vscode-shortcuts.challenge": { mode: "challenge", version: "1", points: 120 },
  "developer-workflow-basics.explore": { mode: "explore", version: "1", points: 80 },
  "git-basics": { mode: "guided", version: "1", points: 160 },
  "developer-workflow-basics.challenge": { mode: "challenge", version: "1", points: 220 },
  "copilot-basics.explore": { mode: "explore", version: "1", points: 70 },
  "copilot-basics.guided": { mode: "guided", version: "1", points: 140 },
  "copilot-basics.challenge": { mode: "challenge", version: "1", points: 180 },
  "artifact-preview-foundation.guided": { mode: "guided", version: "1", points: 40 },
  "html-page-workflow.explore": { mode: "explore", version: "1", points: 80 },
  "html-page-workflow.guided": { mode: "guided", version: "1", points: 180 },
  "html-page-workflow.challenge": { mode: "challenge", version: "1", points: 280 },
  "research-workflow.explore": { mode: "explore", version: "1", points: 80 },
  "research-workflow.guided": { mode: "guided", version: "1", points: 170 },
  "research-workflow.challenge": { mode: "challenge", version: "1", points: 260 },
  "source-control-platform-basics.explore": { mode: "explore", version: "1", points: 60 },
  "source-control-platform-basics.guided": { mode: "guided", version: "1", points: 140 },
  "source-control-platform-basics.challenge": { mode: "challenge", version: "1", points: 220 },
};

function scoreDefinition(ctx) {
  const definition = SCENARIO_SCORE_DEFINITIONS[ctx.args.scenarioId];
  if (!definition || definition.mode !== ctx.args.mode) {
    util.error("Scenario is not registered for server-side scoring", "ScoreDefinitionError");
  }
  return definition;
}

function identityPart(value) {
  return `s${value.length}:${value}`;
}

function scoreAwardId(subject, scenarioId, scenarioVersion) {
  return [
    "score-award:v1",
    `t:${identityPart(subject.tenantId)}`,
    `u:${identityPart(subject.userId)}`,
    `s:${identityPart(scenarioId)}`,
    `v:${identityPart(scenarioVersion)}`,
  ].join("|");
}

function scoreOwnerKey(subject) {
  return ["score-owner:v1", util.base64Encode(subject.tenantId), util.base64Encode(subject.userId)].join(
    ".",
  );
}

function roundScorePoints(points) {
  return Math.round(points * 100) / 100;
}

function highestHintLevels(payload, stepIds) {
  const highest = {};
  const hintUsage = Array.isArray(payload.hintUsage) ? payload.hintUsage : [];

  for (const usage of hintUsage) {
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
      util.error("Training hint evidence is invalid", "ScoreEligibilityError");
    }
    if (typeof usage.stepId !== "string" || usage.stepId.length === 0) {
      util.error("Training hint evidence has no step id", "ScoreEligibilityError");
    }
    if (usage.level !== 1 && usage.level !== 2 && usage.level !== 3) {
      util.error("Training hint evidence has an invalid level", "ScoreEligibilityError");
    }
    if (stepIds.indexOf(usage.stepId) < 0) {
      util.error("Training hint evidence references an unknown step", "ScoreEligibilityError");
    }

    const current = highest[usage.stepId];
    if (current === undefined || usage.level > current) highest[usage.stepId] = usage.level;
  }

  return highest;
}

function calculateScore(ctx, definition) {
  const payload = ctx.stash.scoreSession.payload;
  let stepIds = ["scenario"];
  if (ctx.args.mode === "guided") stepIds = Object.keys(payload.statuses);

  const highestHintLevelByStep =
    ctx.args.mode === "guided" ? highestHintLevels(payload, stepIds) : {};
  const basePointsRaw = definition.points * (SCORE_BASE_PERCENT / 100);
  const bonusPointsRaw = definition.points * (SCORE_BONUS_PERCENT / 100);
  let bonusDeductionRaw = 0;

  if (ctx.args.mode === "guided") {
    const stepBonus = bonusPointsRaw / stepIds.length;
    for (const level of Object.values(highestHintLevelByStep)) {
      bonusDeductionRaw += stepBonus * (HELP_BONUS_DEDUCTION_PERCENT[level] / 100);
    }
  }

  const earnedBonusRaw = Math.max(0, bonusPointsRaw - bonusDeductionRaw);
  const modeMultiplier = SCORE_MODE_MULTIPLIER[ctx.args.mode];
  const awardedPointsRaw = (basePointsRaw + earnedBonusRaw) * modeMultiplier;
  const failedAttempts =
    typeof payload.mistakes === "number" &&
    Number.isFinite(payload.mistakes) &&
    Math.floor(payload.mistakes) === payload.mistakes &&
    payload.mistakes >= 0
      ? payload.mistakes
      : 0;

  return {
    scenarioPoints: roundScorePoints(definition.points),
    basePoints: roundScorePoints(basePointsRaw),
    bonusPoints: roundScorePoints(bonusPointsRaw),
    bonusDeductionPoints: roundScorePoints(bonusDeductionRaw),
    earnedBonusPoints: roundScorePoints(earnedBonusRaw),
    modeMultiplier,
    awardedPoints: roundScorePoints(awardedPointsRaw),
    failedAttempts,
    highestHintLevelByStep,
  };
}

export function request(ctx) {
  const definition = scoreDefinition(ctx);
  const subject = ctx.stash.scoreSubject;
  const session = ctx.stash.scoreSession;
  if (!subject || !session) {
    util.error("Score pipeline state is incomplete", "ScorePipelineError");
  }

  const payload = session.payload;
  if (typeof payload.id !== "string" || payload.id.length === 0) {
    util.error("Training session has no audit id", "ScoreEligibilityError");
  }

  const breakdown = calculateScore(ctx, definition);
  const id = scoreAwardId(subject, ctx.args.scenarioId, definition.version);
  const appendToken = util.autoId();
  const occurredAt = util.time.nowEpochMilliSeconds();
  const values = {
    ownerKey: scoreOwnerKey(subject),
    tenantId: subject.tenantId,
    userId: subject.userId,
    scenarioId: ctx.args.scenarioId,
    scenarioVersion: definition.version,
    sessionId: payload.id,
    mode: ctx.args.mode,
    eventType: SCORE_EVENT_TYPE,
    pointsDelta: breakdown.awardedPoints,
    occurredAt,
    sourceRevision: session.revision,
    metadata: { breakdown },
    appendToken,
  };

  ctx.stash.scoreAppendToken = appendToken;
  ctx.stash.scoreAwardId = id;

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues(values),
    condition: {
      expression: "attribute_not_exists(id)",
      equalsIgnore: [
        "appendToken",
        "sessionId",
        "occurredAt",
        "sourceRevision",
        "pointsDelta",
        "metadata",
      ],
      consistentRead: true,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const event = ctx.result;
  const breakdown = event.metadata?.breakdown;
  if (!event || !breakdown) {
    util.error("Persisted score event is invalid", "ScorePersistenceError");
  }

  return {
    created: event.appendToken === ctx.stash.scoreAppendToken,
    event: {
      id: ctx.stash.scoreAwardId,
      tenantId: event.tenantId,
      userId: event.userId,
      scenarioId: event.scenarioId,
      scenarioVersion: event.scenarioVersion,
      sessionId: event.sessionId,
      mode: event.mode,
      eventType: event.eventType,
      points: event.pointsDelta,
      occurredAt: event.occurredAt,
      sourceRevision: event.sourceRevision,
      breakdown,
    },
  };
}
