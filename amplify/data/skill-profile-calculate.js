import { util } from "@aws-appsync/utils";

const LEVEL_THRESHOLDS = [
  { id: "novice", minPoints: 0, requiresEligibleChallenge: false },
  { id: "advanced_beginner", minPoints: 1, requiresEligibleChallenge: false },
  { id: "practitioner", minPoints: 200, requiresEligibleChallenge: true },
  { id: "proficient", minPoints: 500, requiresEligibleChallenge: true },
];

const TECHNOLOGY_SCENARIOS = {
  ide: [
    "vscode-basics.explore",
    "vscode-basics.guided",
    "vscode-basics.challenge",
    "vscode-shortcuts.challenge",
  ],
  ai_coding_assistant: [
    "copilot-basics.explore",
    "copilot-basics.guided",
    "copilot-basics.challenge",
  ],
  cli_agent: ["claude-code-basics.guided"],
  source_control: [
    "source-control-platform-basics.explore",
    "source-control-platform-basics.guided",
    "source-control-platform-basics.challenge",
  ],
  artifact_preview: ["artifact-preview-foundation.guided"],
  office_assistant: [
    "m365-copilot-basics.explore",
    "m365-copilot-basics.guided",
    "m365-copilot-basics.challenge",
  ],
};

function technologyByScenario() {
  const result = {};
  for (const [technologyId, scenarioIds] of Object.entries(TECHNOLOGY_SCENARIOS)) {
    for (const scenarioId of scenarioIds) result[scenarioId] = technologyId;
  }
  return result;
}

function resolveLevel(points, eligibleChallengeCount) {
  let level = "novice";
  for (const threshold of LEVEL_THRESHOLDS) {
    if (
      points >= threshold.minPoints &&
      (!threshold.requiresEligibleChallenge || eligibleChallengeCount >= 1)
    ) {
      level = threshold.id;
    }
  }
  return level;
}

function roundPoints(points) {
  return Math.round(points * 100) / 100;
}

function scenarioVersionKey(scenarioId, scenarioVersion) {
  return `${scenarioId}@${scenarioVersion}`;
}

export function request() {
  return { payload: {} };
}

export function response(ctx) {
  const subject = ctx.stash.skillSubject;
  if (!subject) {
    util.error("Skill profile subject is missing", "SkillProfilePipelineError");
  }

  const scenarioTechnology = technologyByScenario();
  const eligibleScenarioVersionKeys = {};
  const eligibleChallengeKeysByTechnology = {};
  const sourceRevisionByTechnology = {};

  for (const technologyId of Object.keys(TECHNOLOGY_SCENARIOS)) {
    eligibleChallengeKeysByTechnology[technologyId] = {};
    sourceRevisionByTechnology[technologyId] = 0;
  }

  for (const run of ctx.stash.skillScenarioRuns || []) {
    const technologyId = scenarioTechnology[run.scenarioId];
    if (technologyId) {
      if (typeof run.sourceRevision === "number") {
        sourceRevisionByTechnology[technologyId] = Math.max(
          sourceRevisionByTechnology[technologyId],
          run.sourceRevision,
        );
      }
      if (run.evidenceEligible === true) {
        const evidenceKey = scenarioVersionKey(run.scenarioId, run.scenarioVersion);
        eligibleScenarioVersionKeys[evidenceKey] = true;
        if (run.mode === "challenge") {
          eligibleChallengeKeysByTechnology[technologyId][evidenceKey] = true;
        }
      }
    }
  }

  const pointsByTechnology = {};
  for (const technologyId of Object.keys(TECHNOLOGY_SCENARIOS))
    pointsByTechnology[technologyId] = 0;

  for (const event of ctx.stash.skillScoreEvents || []) {
    const technologyId = scenarioTechnology[event.scenarioId];
    if (technologyId) {
      if (typeof event.pointsDelta !== "number" || !Number.isFinite(event.pointsDelta)) {
        util.error("Score event contains invalid points", "SkillProfileEvidenceError");
      }
      if (typeof event.sourceRevision === "number") {
        sourceRevisionByTechnology[technologyId] = Math.max(
          sourceRevisionByTechnology[technologyId],
          event.sourceRevision,
        );
      }

      const evidenceKey = scenarioVersionKey(event.scenarioId, event.scenarioVersion);
      if (eligibleScenarioVersionKeys[evidenceKey] === true) {
        pointsByTechnology[technologyId] += event.pointsDelta;
      }
    }
  }

  const calculatedAt = util.time.nowEpochMilliSeconds();
  const result = [];
  for (const technologyId of Object.keys(TECHNOLOGY_SCENARIOS)) {
    const eligibleChallengeCount = Object.keys(
      eligibleChallengeKeysByTechnology[technologyId],
    ).length;
    const points = roundPoints(pointsByTechnology[technologyId]);
    result.push({
      tenantId: subject.tenantId,
      userId: subject.userId,
      technologyId,
      points,
      level: resolveLevel(points, eligibleChallengeCount),
      eligibleChallengeCount,
      sourceRevision: sourceRevisionByTechnology[technologyId],
      calculatedAt,
    });
  }

  return result;
}
