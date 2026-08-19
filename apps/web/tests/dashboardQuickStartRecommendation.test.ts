import assert from "node:assert/strict";
import test from "node:test";
import type {
  DashboardPrimaryAction,
  DashboardResumeCandidate,
  DashboardTrainingCandidate,
} from "../src/dashboard/dashboardRecommendation.ts";
import { selectCalibratedDashboardRecommendation } from "../src/dashboard/dashboardQuickStartRecommendation.ts";

const candidates: DashboardTrainingCandidate[] = [
  {
    scenarioId: "vscode-basics.guided",
    title: "VS Code Guided",
    mode: "guided",
    learningLayer: "tool",
    technologyId: "ide",
    technologyName: "IDE",
  },
  {
    scenarioId: "vscode-basics.explore",
    title: "VS Code Explore",
    mode: "explore",
    learningLayer: "tool",
    technologyId: "ide",
    technologyName: "IDE",
  },
  {
    scenarioId: "vscode-basics.challenge",
    title: "VS Code Challenge",
    mode: "challenge",
    learningLayer: "tool",
    technologyId: "ide",
    technologyName: "IDE",
  },
  {
    scenarioId: "research-workflow.guided",
    title: "Recherche Guided",
    mode: "guided",
    learningLayer: "ai_workflow",
    technologyId: "artifact_preview",
    technologyName: "Artifact Preview",
  },
  {
    scenarioId: "research-workflow.explore",
    title: "Recherche Explore",
    mode: "explore",
    learningLayer: "ai_workflow",
    technologyId: "artifact_preview",
    technologyName: "Artifact Preview",
  },
  {
    scenarioId: "research-workflow.challenge",
    title: "Recherche Challenge",
    mode: "challenge",
    learningLayer: "ai_workflow",
    technologyId: "artifact_preview",
    technologyName: "Artifact Preview",
  },
];

const baseStart: DashboardPrimaryAction = {
  kind: "start",
  scenarioId: "vscode-basics.guided",
  title: "VS Code Guided",
  reason: "Bestehende #37-Empfehlung.",
};

function resumeCandidate(): DashboardResumeCandidate {
  return {
    scenarioId: "vscode-basics.guided",
    title: "VS Code Guided",
    mode: "guided",
    learningLayer: "tool",
    technologyId: "ide",
    technologyName: "IDE",
    updatedAt: 100,
    activeStepTitle: "Explorer öffnen",
  };
}

test("beginner calibration keeps a guided tool foundation as deterministic first step", () => {
  const recommendation = selectCalibratedDashboardRecommendation({
    basePrimaryAction: baseStart,
    resumable: [],
    trainingCandidates: [...candidates].reverse(),
    calibration: {
      goal: "daily_confidence",
      selfAssessedAiLevel: "beginner",
      preferredMode: "guided",
    },
  });

  assert.equal(recommendation.primaryAction?.kind, "start");
  assert.equal(recommendation.primaryAction?.scenarioId, "vscode-basics.guided");
  assert.equal(recommendation.path[0]?.scenarioId, "vscode-basics.guided");
  assert.equal(recommendation.path.length, 2);
  assert.match(recommendation.explanation ?? "", /Anfänger/);
  assert.match(recommendation.explanation ?? "", /Guided/);
});

test("intermediate calibration can prefer an application workflow in the requested mode", () => {
  const recommendation = selectCalibratedDashboardRecommendation({
    basePrimaryAction: baseStart,
    resumable: [],
    trainingCandidates: candidates,
    calibration: {
      goal: "solve_task",
      selfAssessedAiLevel: "intermediate",
      preferredMode: "explore",
    },
  });

  assert.equal(recommendation.primaryAction?.kind, "start");
  assert.equal(recommendation.primaryAction?.scenarioId, "research-workflow.explore");
  assert.equal(recommendation.path[0]?.scenarioId, "research-workflow.explore");
  assert.match(recommendation.explanation ?? "", /Fortgeschritten/);
  assert.match(recommendation.explanation ?? "", /Explore/);
});

test("a resumable #37 action always remains the single primary action after calibration", () => {
  const resume = resumeCandidate();
  const baseResume: DashboardPrimaryAction = {
    kind: "resume",
    scenarioId: resume.scenarioId,
    title: resume.title,
    reason: "Du hast dieses Training bereits begonnen.",
    activeStepTitle: resume.activeStepTitle,
  };

  const recommendation = selectCalibratedDashboardRecommendation({
    basePrimaryAction: baseResume,
    resumable: [resume],
    trainingCandidates: candidates,
    calibration: {
      goal: "solve_task",
      selfAssessedAiLevel: "intermediate",
      preferredMode: "challenge",
    },
  });

  assert.deepEqual(recommendation.primaryAction, baseResume);
  assert.equal(recommendation.path[0]?.scenarioId, resume.scenarioId);
  assert.ok(recommendation.path.length >= 2 && recommendation.path.length <= 4);
  assert.match(recommendation.explanation ?? "", /bereits begonnen/);
  assert.match(recommendation.explanation ?? "", /Challenge/);
});
