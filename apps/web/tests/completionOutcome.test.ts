import assert from "node:assert/strict";
import test from "node:test";
import {
  createScoreEvent,
  type AppendScoreEventResult,
  type SkillLevel,
  type SkillProfileProjection,
} from "@ai-train-lab/training-engine";
import {
  completionCompetencyPresentation,
  completionScorePresentation,
  type CompletionSkillProfilesSnapshot,
} from "../src/completion/completionOutcome.ts";
import {
  selectPrimaryDashboardAction,
  type DashboardTrainingCandidate,
} from "../src/dashboard/dashboardRecommendation.ts";

const starterCandidates: DashboardTrainingCandidate[] = [
  {
    scenarioId: "vscode-basics.guided",
    title: "Visual Studio Code – Geführte Grundlagen",
    mode: "guided",
    learningLayer: "tool",
    technologyId: "ide",
    technologyName: "IDE",
  },
  {
    scenarioId: "source-control-platform-basics.guided",
    title: "GitHub – Grundlagen",
    mode: "guided",
    learningLayer: "tool",
    technologyId: "source_control",
    technologyName: "Source Control",
  },
  {
    scenarioId: "copilot-basics.guided",
    title: "GitHub Copilot – Grundlagen",
    mode: "guided",
    learningLayer: "tool",
    technologyId: "ai_coding_assistant",
    technologyName: "AI Coding Assistant",
  },
  {
    scenarioId: "claude-code-basics.guided",
    title: "Claude Code – Vorschlag prüfen und freigeben",
    mode: "guided",
    learningLayer: "ai_workflow",
    technologyId: "cli_agent",
    technologyName: "CLI Agent",
  },
];

function award(created: boolean, occurredAt = 200): AppendScoreEventResult {
  return {
    created,
    event: createScoreEvent({
      subject: { userId: "learner-1", tenantId: "tenant-1" },
      scenarioId: "vscode-basics.guided",
      scenarioVersion: "1",
      sessionId: "session-1",
      scenarioPoints: 100,
      mode: "guided",
      stepIds: ["step-1"],
      occurredAt,
      sourceRevision: 2,
    }),
  };
}

function profile({
  technologyId = "ide",
  level = "novice",
  points = 0,
  sourceRevision = 1,
  calculatedAt = 100,
}: {
  technologyId?: string;
  level?: SkillLevel;
  points?: number;
  sourceRevision?: number;
  calculatedAt?: number;
} = {}): SkillProfileProjection {
  return {
    technologyId,
    level,
    points,
    eligibleChallengeCount: 0,
    sourceRevision,
    calculatedAt,
  };
}

function skillState(
  status: CompletionSkillProfilesSnapshot["status"],
  profiles: SkillProfileProjection[] = [],
): CompletionSkillProfilesSnapshot {
  return { status, profiles, error: status === "error" ? "failed" : null };
}

test("score presentation keeps server-authoritative points for new and already-awarded runs", () => {
  assert.deepEqual(completionScorePresentation("ready", award(true)), {
    value: "100",
    detail: "awarded",
  });
  assert.deepEqual(completionScorePresentation("ready", award(false)), {
    value: "100 · bereits gewertet",
    detail: "already_awarded",
  });
});

test("score presentation covers pending, error and local unavailable states without replacement points", () => {
  assert.equal(completionScorePresentation("pending", null).detail, "pending");
  assert.equal(completionScorePresentation("error", null).detail, "error");
  assert.deepEqual(completionScorePresentation("unavailable", null), {
    value: "—",
    detail: "unavailable",
  });
});

test("competency waits for scoring and reports scoring failures separately", () => {
  const baseline = skillState("ready", [profile()]);
  assert.equal(
    completionCompetencyPresentation({
      scoreStatus: "pending",
      scoreResult: null,
      baseline,
      current: null,
    }).kind,
    "waiting_for_score",
  );
  assert.equal(
    completionCompetencyPresentation({
      scoreStatus: "error",
      scoreResult: null,
      baseline,
      current: null,
    }).kind,
    "score_error",
  );
});

test("competency exposes loading, unavailable and error states without estimating a level", () => {
  const scoreResult = award(true);
  const baseline = skillState("ready", [profile()]);
  assert.equal(
    completionCompetencyPresentation({
      scoreStatus: "ready",
      scoreResult,
      baseline,
      current: skillState("loading"),
    }).kind,
    "loading",
  );
  assert.equal(
    completionCompetencyPresentation({
      scoreStatus: "ready",
      scoreResult,
      baseline,
      current: skillState("unavailable"),
    }).kind,
    "unavailable",
  );
  assert.equal(
    completionCompetencyPresentation({
      scoreStatus: "ready",
      scoreResult,
      baseline,
      current: skillState("error"),
    }).kind,
    "error",
  );
});

test("new authoritative profile can show an improved competency level", () => {
  const scoreResult = award(true, 200);
  const presentation = completionCompetencyPresentation({
    scoreStatus: "ready",
    scoreResult,
    baseline: skillState("ready", [profile({ level: "novice", points: 0, calculatedAt: 100 })]),
    current: skillState("ready", [
      profile({
        level: "advanced_beginner",
        points: 100,
        sourceRevision: 2,
        calculatedAt: 300,
      }),
    ]),
  });

  assert.equal(presentation.kind, "changed");
  if (presentation.kind !== "changed") return;
  assert.equal(presentation.changes.length, 1);
  assert.equal(presentation.changes[0]?.levelChanged, true);
  assert.equal(presentation.changes[0]?.before?.level, "novice");
  assert.equal(presentation.changes[0]?.after?.level, "advanced_beginner");
});

test("new authoritative evidence can leave the competency level unchanged", () => {
  const presentation = completionCompetencyPresentation({
    scoreStatus: "ready",
    scoreResult: award(true, 200),
    baseline: skillState("ready", [profile({ level: "novice", points: 0, calculatedAt: 100 })]),
    current: skillState("ready", [
      profile({ level: "novice", points: 50, sourceRevision: 2, calculatedAt: 300 }),
    ]),
  });

  assert.equal(presentation.kind, "changed");
  if (presentation.kind !== "changed") return;
  assert.equal(presentation.changes[0]?.levelChanged, false);
  assert.equal(presentation.changes[0]?.pointsChanged, true);
});

test("unchanged immediate projection stays pending after a newly created award", () => {
  const before = profile({ calculatedAt: 100 });
  const presentation = completionCompetencyPresentation({
    scoreStatus: "ready",
    scoreResult: award(true, 200),
    baseline: skillState("ready", [before]),
    current: skillState("ready", [{ ...before, calculatedAt: 300 }]),
  });

  assert.equal(presentation.kind, "projection_pending");
});

test("a profile calculated after the award is never accepted as a before-state", () => {
  const presentation = completionCompetencyPresentation({
    scoreStatus: "ready",
    scoreResult: award(true, 200),
    baseline: skillState("ready", [profile({ calculatedAt: 250 })]),
    current: skillState("ready", [
      profile({ level: "advanced_beginner", points: 100, sourceRevision: 2, calculatedAt: 300 }),
    ]),
  });

  assert.equal(presentation.kind, "current_only");
});

test("already-awarded scenario version never claims a new competency change", () => {
  const presentation = completionCompetencyPresentation({
    scoreStatus: "ready",
    scoreResult: award(false, 200),
    baseline: skillState("ready", [profile({ calculatedAt: 100 })]),
    current: skillState("ready", [
      profile({ level: "advanced_beginner", points: 100, sourceRevision: 2, calculatedAt: 300 }),
    ]),
  });

  assert.equal(presentation.kind, "already_awarded");
});

test("completion reuses the dashboard recommendation policy while excluding the just-finished starter", () => {
  const action = selectPrimaryDashboardAction({
    resumable: [],
    trainingCandidates: starterCandidates.filter(
      (candidate) => candidate.scenarioId !== "vscode-basics.guided",
    ),
    authoritativeProfiles: null,
  });

  assert.equal(action?.kind, "start");
  assert.equal(action?.scenarioId, "source-control-platform-basics.guided");
});

test("shared recommendation policy still gives an unfinished training priority on completion", () => {
  const action = selectPrimaryDashboardAction({
    resumable: [
      {
        scenarioId: "git-basics",
        title: "Workflow fortsetzen",
        mode: "guided",
        learningLayer: "ai_workflow",
        technologyId: null,
        technologyName: null,
        updatedAt: 500,
        activeStepTitle: "Diff prüfen",
      },
    ],
    trainingCandidates: starterCandidates,
    authoritativeProfiles: null,
  });

  assert.equal(action?.kind, "resume");
  assert.equal(action?.scenarioId, "git-basics");
});

test("no remaining candidate yields no recommendation so the UI can use its defined overview fallback", () => {
  assert.equal(
    selectPrimaryDashboardAction({
      resumable: [],
      trainingCandidates: [],
      authoritativeProfiles: null,
    }),
    null,
  );
});
