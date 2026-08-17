import type {
  SkillLevel,
  SkillProfileProjection,
  TrainingMode,
} from "@ai-train-lab/training-engine";

export interface DashboardTrainingCandidate {
  scenarioId: string;
  title: string;
  mode: TrainingMode;
  learningLayer: string | null;
  technologyId: string | null;
  technologyName: string | null;
}

export interface DashboardResumeCandidate extends DashboardTrainingCandidate {
  updatedAt: number;
  activeStepTitle: string | null;
}

export type DashboardPrimaryAction =
  | {
      kind: "resume";
      scenarioId: string;
      title: string;
      reason: string;
      activeStepTitle: string | null;
    }
  | {
      kind: "start";
      scenarioId: string;
      title: string;
      reason: string;
    };

const skillLevelRank: Record<SkillLevel, number> = {
  novice: 0,
  advanced_beginner: 1,
  practitioner: 2,
  proficient: 3,
};

/**
 * Explicit application learning-path order used only as a deterministic tie-breaker/fallback.
 * It does not create skill evidence or points; authoritative SkillProfile data remains the
 * competency truth whenever it is available.
 */
export const starterTechnologyPriority = [
  "ide",
  "source_control",
  "ai_coding_assistant",
  "cli_agent",
  "artifact_preview",
] as const;

function technologyPriority(technologyId: string | null): number {
  const index = starterTechnologyPriority.indexOf(
    technologyId as (typeof starterTechnologyPriority)[number],
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function levelLabel(level: SkillLevel): string {
  switch (level) {
    case "novice":
      return "Novice";
    case "advanced_beginner":
      return "Advanced Beginner";
    case "practitioner":
      return "Practitioner";
    case "proficient":
      return "Proficient";
  }
}

export function sortResumeCandidates(
  resumable: readonly DashboardResumeCandidate[],
): DashboardResumeCandidate[] {
  return [...resumable].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || left.scenarioId.localeCompare(right.scenarioId),
  );
}

export function selectPrimaryDashboardAction({
  resumable,
  trainingCandidates,
  authoritativeProfiles,
}: {
  resumable: readonly DashboardResumeCandidate[];
  trainingCandidates: readonly DashboardTrainingCandidate[];
  authoritativeProfiles: readonly SkillProfileProjection[] | null;
}): DashboardPrimaryAction | null {
  const firstResume = sortResumeCandidates(resumable)[0];
  if (firstResume) {
    return {
      kind: "resume",
      scenarioId: firstResume.scenarioId,
      title: firstResume.title,
      reason: firstResume.activeStepTitle
        ? `Du hast hier zuletzt gearbeitet. Weiter geht es bei „${firstResume.activeStepTitle}“.`
        : "Du hast dieses Training bereits begonnen. Dein gespeicherter Arbeitsstand wird wiederhergestellt.",
      activeStepTitle: firstResume.activeStepTitle,
    };
  }

  const toolGuidedCandidates = trainingCandidates.filter(
    (candidate) =>
      candidate.mode === "guided" &&
      candidate.learningLayer === "tool" &&
      candidate.technologyId !== null,
  );
  if (toolGuidedCandidates.length === 0) return null;

  const profilesByTechnology =
    authoritativeProfiles === null
      ? null
      : new Map(authoritativeProfiles.map((profile) => [profile.technologyId, profile]));

  const ordered = [...toolGuidedCandidates].sort((left, right) => {
    if (profilesByTechnology) {
      const leftProfile = left.technologyId
        ? profilesByTechnology.get(left.technologyId)
        : undefined;
      const rightProfile = right.technologyId
        ? profilesByTechnology.get(right.technologyId)
        : undefined;
      const leftRank = leftProfile ? skillLevelRank[leftProfile.level] : -1;
      const rightRank = rightProfile ? skillLevelRank[rightProfile.level] : -1;
      if (leftRank !== rightRank) return leftRank - rightRank;
    }

    const priorityDifference =
      technologyPriority(left.technologyId) - technologyPriority(right.technologyId);
    if (priorityDifference !== 0) return priorityDifference;
    return left.scenarioId.localeCompare(right.scenarioId);
  });

  const selected = ordered[0];
  if (!selected) return null;

  if (!profilesByTechnology || !selected.technologyId) {
    return {
      kind: "start",
      scenarioId: selected.scenarioId,
      title: selected.title,
      reason:
        "Solange kein autoritatives Kompetenzprofil verfügbar ist, folgt die Empfehlung dem festen Grundlagen-Lernpfad.",
    };
  }

  const selectedProfile = profilesByTechnology.get(selected.technologyId);
  if (!selectedProfile) {
    return {
      kind: "start",
      scenarioId: selected.scenarioId,
      title: selected.title,
      reason: selected.technologyName
        ? `Für ${selected.technologyName} liegt noch kein serverseitig bestätigter Kompetenznachweis vor.`
        : "Für diesen Lernbereich liegt noch kein serverseitig bestätigter Kompetenznachweis vor.",
    };
  }

  return {
    kind: "start",
    scenarioId: selected.scenarioId,
    title: selected.title,
    reason: selected.technologyName
      ? `${selected.technologyName} ist aktuell auf Stufe ${levelLabel(selectedProfile.level)} bestätigt.`
      : `Die aktuell niedrigste bestätigte Kompetenzstufe ist ${levelLabel(selectedProfile.level)}.`,
  };
}
