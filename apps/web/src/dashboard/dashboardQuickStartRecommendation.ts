import type { SelfAssessedAiLevel, TrainingMode } from "@ai-train-lab/training-engine";
import { aiLevelLabel } from "../profile/aiLevelOptions.ts";
import {
  starterTechnologyPriority,
  type DashboardPrimaryAction,
  type DashboardResumeCandidate,
  type DashboardTrainingCandidate,
} from "./dashboardRecommendation.ts";

export type DashboardLearningGoal = "learn_tool" | "daily_confidence" | "solve_task" | "deepen";

export interface DashboardQuickStartCalibration {
  goal: DashboardLearningGoal;
  selfAssessedAiLevel: SelfAssessedAiLevel;
  preferredMode: TrainingMode;
}

export interface DashboardQuickStartPathItem {
  scenarioId: string;
  title: string;
  mode: TrainingMode;
  technologyName: string | null;
}

export interface DashboardQuickStartRecommendation {
  primaryAction: DashboardPrimaryAction | null;
  path: DashboardQuickStartPathItem[];
  explanation: string | null;
}

function technologyPriority(technologyId: string | null): number {
  const index = starterTechnologyPriority.indexOf(
    technologyId as (typeof starterTechnologyPriority)[number],
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function preferredLearningLayer(
  goal: DashboardLearningGoal,
  level: SelfAssessedAiLevel,
): string | null {
  switch (goal) {
    case "learn_tool":
      return "tool";
    case "solve_task":
      return "ai_workflow";
    case "daily_confidence":
    case "deepen":
      return level === "beginner" ? "tool" : "ai_workflow";
  }
}

function learningGoalLabel(goal: DashboardLearningGoal): string {
  switch (goal) {
    case "learn_tool":
      return "Werkzeug kennenlernen";
    case "daily_confidence":
      return "sicherer im Alltag werden";
    case "solve_task":
      return "eine konkrete Aufgabe lösen";
    case "deepen":
      return "Kenntnisse vertiefen";
  }
}

function modeLabel(mode: TrainingMode): string {
  switch (mode) {
    case "guided":
      return "Guided";
    case "explore":
      return "Explore";
    case "challenge":
      return "Challenge";
  }
}

function preferredTechnologyFromBaseAction(
  basePrimaryAction: DashboardPrimaryAction | null,
  trainingCandidates: readonly DashboardTrainingCandidate[],
): string | null {
  if (!basePrimaryAction) return null;
  return (
    trainingCandidates.find((candidate) => candidate.scenarioId === basePrimaryAction.scenarioId)
      ?.technologyId ?? null
  );
}

function orderedCalibrationCandidates({
  trainingCandidates,
  calibration,
  preferredTechnologyId,
}: {
  trainingCandidates: readonly DashboardTrainingCandidate[];
  calibration: DashboardQuickStartCalibration;
  preferredTechnologyId: string | null;
}): DashboardTrainingCandidate[] {
  const layer = preferredLearningLayer(calibration.goal, calibration.selfAssessedAiLevel);
  const modeCandidates = trainingCandidates.filter(
    (candidate) => candidate.mode === calibration.preferredMode,
  );

  return [...modeCandidates].sort((left, right) => {
    const leftLayerRank = left.learningLayer === layer ? 0 : 1;
    const rightLayerRank = right.learningLayer === layer ? 0 : 1;
    if (leftLayerRank !== rightLayerRank) return leftLayerRank - rightLayerRank;

    const leftBaseRank =
      preferredTechnologyId !== null && left.technologyId === preferredTechnologyId ? 0 : 1;
    const rightBaseRank =
      preferredTechnologyId !== null && right.technologyId === preferredTechnologyId ? 0 : 1;
    if (leftBaseRank !== rightBaseRank) return leftBaseRank - rightBaseRank;

    const priorityDifference =
      technologyPriority(left.technologyId) - technologyPriority(right.technologyId);
    if (priorityDifference !== 0) return priorityDifference;
    return left.scenarioId.localeCompare(right.scenarioId);
  });
}

function uniquePath(
  candidates: readonly DashboardTrainingCandidate[],
  limit = 4,
): DashboardQuickStartPathItem[] {
  const seen = new Set<string>();
  const result: DashboardQuickStartPathItem[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.scenarioId)) continue;
    seen.add(candidate.scenarioId);
    result.push({
      scenarioId: candidate.scenarioId,
      title: candidate.title,
      mode: candidate.mode,
      technologyName: candidate.technologyName,
    });
    if (result.length >= limit) break;
  }

  return result;
}

export function selectCalibratedDashboardRecommendation({
  basePrimaryAction,
  resumable,
  trainingCandidates,
  calibration,
}: {
  basePrimaryAction: DashboardPrimaryAction | null;
  resumable: readonly DashboardResumeCandidate[];
  trainingCandidates: readonly DashboardTrainingCandidate[];
  calibration: DashboardQuickStartCalibration;
}): DashboardQuickStartRecommendation {
  const preferredTechnologyId = preferredTechnologyFromBaseAction(
    basePrimaryAction,
    trainingCandidates,
  );
  const calibratedCandidates = orderedCalibrationCandidates({
    trainingCandidates,
    calibration,
    preferredTechnologyId,
  });

  if (basePrimaryAction?.kind === "resume") {
    const resumeCandidate = resumable.find(
      (candidate) => candidate.scenarioId === basePrimaryAction.scenarioId,
    );
    const path = uniquePath([
      ...(resumeCandidate ? [resumeCandidate] : []),
      ...calibratedCandidates,
    ]);

    return {
      primaryAction: basePrimaryAction,
      path,
      explanation: `${basePrimaryAction.reason} Danach folgt der Lernpfad für „${learningGoalLabel(calibration.goal)}“ im Modus ${modeLabel(calibration.preferredMode)}.`,
    };
  }

  const firstCandidate = calibratedCandidates[0];
  if (!firstCandidate) {
    return {
      primaryAction: basePrimaryAction,
      path: [],
      explanation: basePrimaryAction?.reason ?? null,
    };
  }

  const explanation = `Dein Ziel „${learningGoalLabel(calibration.goal)}“, deine Selbsteinschätzung „${aiLevelLabel(calibration.selfAssessedAiLevel)}“ und die gewünschte Arbeitsweise ${modeLabel(calibration.preferredMode)} führen regelbasiert zu diesem Einstieg.`;

  return {
    primaryAction: {
      kind: "start",
      scenarioId: firstCandidate.scenarioId,
      title: firstCandidate.title,
      reason: explanation,
    },
    path: uniquePath(calibratedCandidates),
    explanation,
  };
}
