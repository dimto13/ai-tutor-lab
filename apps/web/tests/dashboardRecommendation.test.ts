import assert from "node:assert/strict";
import test from "node:test";
import type { SkillProfileProjection } from "@ai-train-lab/training-engine";
import {
  selectPrimaryDashboardAction,
  shouldWaitForDashboardRecommendation,
  sortResumeCandidates,
  type DashboardResumeCandidate,
  type DashboardTrainingCandidate,
} from "../src/dashboard/dashboardRecommendation.ts";

const candidates: DashboardTrainingCandidate[] = [
  {
    scenarioId: "copilot-basics.guided",
    title: "GitHub Copilot – Grundlagen",
    mode: "guided",
    learningLayer: "tool",
    technologyId: "ai_coding_assistant",
    technologyName: "AI Coding Assistant",
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
    scenarioId: "vscode-basics.guided",
    title: "Visual Studio Code – Grundlagen",
    mode: "guided",
    learningLayer: "tool",
    technologyId: "ide",
    technologyName: "IDE",
  },
  {
    scenarioId: "developer-workflow-basics.challenge",
    title: "Workflow Challenge",
    mode: "challenge",
    learningLayer: "ai_workflow",
    technologyId: "ide",
    technologyName: "IDE",
  },
];

function profile(
  technologyId: string,
  level: SkillProfileProjection["level"],
): SkillProfileProjection {
  return {
    technologyId,
    level,
    points: 0,
    eligibleChallengeCount: 0,
    sourceRevision: 1,
    calculatedAt: 1,
  };
}

function resume(scenarioId: string, title: string, updatedAt: number): DashboardResumeCandidate {
  return {
    scenarioId,
    title,
    mode: "guided",
    learningLayer: "tool",
    technologyId: "ide",
    technologyName: "IDE",
    updatedAt,
    activeStepTitle: "Nächster gespeicherter Schritt",
  };
}

test("recommendation waits for competency data only when no resumable training exists", () => {
  assert.equal(
    shouldWaitForDashboardRecommendation({
      resumeLoading: false,
      hasResumable: false,
      skillProfilesLoading: true,
    }),
    true,
  );
  assert.equal(
    shouldWaitForDashboardRecommendation({
      resumeLoading: false,
      hasResumable: true,
      skillProfilesLoading: true,
    }),
    false,
  );
  assert.equal(
    shouldWaitForDashboardRecommendation({
      resumeLoading: false,
      hasResumable: false,
      skillProfilesLoading: false,
    }),
    false,
  );
});

test("recommendation always waits while the resume scan is still running", () => {
  assert.equal(
    shouldWaitForDashboardRecommendation({
      resumeLoading: true,
      hasResumable: false,
      skillProfilesLoading: false,
    }),
    true,
  );
});

test("an unfinished training always wins over a new competency-based start", () => {
  const action = selectPrimaryDashboardAction({
    resumable: [resume("git-basics", "Git Workflow", 100)],
    trainingCandidates: candidates,
    authoritativeProfiles: [profile("ide", "novice")],
  });

  assert.equal(action?.kind, "resume");
  assert.equal(action?.scenarioId, "git-basics");
});

test("multiple resumable trainings are ordered by latest persisted update and stable scenario id", () => {
  const newest = resume("source-control-platform-basics.guided", "GitHub", 200);
  const older = resume("vscode-basics.guided", "VS Code", 100);

  assert.deepEqual(
    sortResumeCandidates([older, newest]).map((candidate) => candidate.scenarioId),
    ["source-control-platform-basics.guided", "vscode-basics.guided"],
  );
  assert.deepEqual(
    sortResumeCandidates([
      resume("vscode-basics.guided", "VS Code", 300),
      resume("copilot-basics.guided", "Copilot", 300),
    ]).map((candidate) => candidate.scenarioId),
    ["copilot-basics.guided", "vscode-basics.guided"],
  );
});

test("authoritative competency levels choose the least demonstrated tool area deterministically", () => {
  const action = selectPrimaryDashboardAction({
    resumable: [],
    trainingCandidates: [...candidates].reverse(),
    authoritativeProfiles: [
      profile("ide", "practitioner"),
      profile("source_control", "advanced_beginner"),
      profile("ai_coding_assistant", "novice"),
    ],
  });

  assert.equal(action?.kind, "start");
  assert.equal(action?.scenarioId, "copilot-basics.guided");
});

test("missing authoritative technology evidence outranks an already confirmed novice level", () => {
  const action = selectPrimaryDashboardAction({
    resumable: [],
    trainingCandidates: candidates,
    authoritativeProfiles: [profile("ide", "novice"), profile("source_control", "novice")],
  });

  assert.equal(action?.scenarioId, "copilot-basics.guided");
  assert.match(action?.reason ?? "", /kein serverseitig bestätigter Kompetenznachweis/);
});

test("unavailable skill profiles degrade to the explicit starter path independent of UI order", () => {
  const normal = selectPrimaryDashboardAction({
    resumable: [],
    trainingCandidates: candidates,
    authoritativeProfiles: null,
  });
  const reversed = selectPrimaryDashboardAction({
    resumable: [],
    trainingCandidates: [...candidates].reverse(),
    authoritativeProfiles: null,
  });

  assert.equal(normal?.scenarioId, "vscode-basics.guided");
  assert.equal(reversed?.scenarioId, "vscode-basics.guided");
  assert.match(normal?.reason ?? "", /festen Grundlagen-Lernpfad/);
});
