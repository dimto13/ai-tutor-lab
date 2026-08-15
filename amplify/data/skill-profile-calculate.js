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
    if (points < threshold.minPoints) continue;
    if (threshold.requiresEligibleChallenge && eligibleChallengeCount < 1) continue;
    level = threshold.id;
  }
  return level;
}

function roundPoints(points) {
  return Math.round(points * 100) / 100;
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
  const profiles = {};
  for (const technologyId of Object.keys(TECHNOLOGY_SCENARIOS)) {
    profiles[technologyId] = {
      technologyId,
      points: 0,
      eligibleChallengeKeys: {},
      sourceRevision: 0,
    };
  }

  for (const event of ctx.stash.skillScoreEvents || []) {
    const technologyId = scenarioTechnology[event.scenarioId];
    if (!technologyId) continue;
    if (typeof event.pointsDelta !== "number" || !Number.isFinite(event.pointsDelta)) {
      util.error("Score event contains invalid points", "SkillProfileEvidenceError");
    }
    const profile = profiles[technologyId];
    profile.points += event.pointsDelta;
    if (typeof event.sourceRevision === "number") {
      profile.sourceRevision = Math.max(profile.sourceRevision, event.sourceRevision);
    }
  }

  for (const run of ctx.stash.skillScenarioRuns || []) {
    const technologyId = scenarioTechnology[run.scenarioId];
    if (!technologyId) continue;
    const profile = profiles[technologyId];
    if (typeof run.sourceRevision === "number") {
      profile.sourceRevision = Math.max(profile.sourceRevision, run.sourceRevision);
    }
    if (run.mode === "challenge" && run.evidenceEligible === true) {
      const challengeKey = `${run.scenarioId}@${run.scenarioVersion}`;
      profile.eligibleChallengeKeys[challengeKey] = true;
    }
  }

  const calculatedAt = util.time.nowEpochMilliSeconds();
  const result = [];
  for (const technologyId of Object.keys(TECHNOLOGY_SCENARIOS)) {
    const profile = profiles[technologyId];
    const eligibleChallengeCount = Object.keys(profile.eligibleChallengeKeys).length;
    const points = roundPoints(profile.points);
    result.push({
      tenantId: subject.tenantId,
      userId: subject.userId,
      technologyId,
      points,
      level: resolveLevel(points, eligibleChallengeCount),
      eligibleChallengeCount,
      sourceRevision: profile.sourceRevision,
      calculatedAt,
    });
  }

  return result;
}
