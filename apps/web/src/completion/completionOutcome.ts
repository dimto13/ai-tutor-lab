import type {
  AppendScoreEventResult,
  SkillLevel,
  SkillProfileProjection,
} from "@ai-train-lab/training-engine";

export type CompletionScoreAwardStatus = "idle" | "unavailable" | "pending" | "ready" | "error";

export interface CompletionSkillProfilesSnapshot {
  status: "unavailable" | "loading" | "ready" | "error";
  profiles: SkillProfileProjection[];
  error: string | null;
}

export interface CompletionScorePresentation {
  value: string;
  detail: "pending" | "awarded" | "already_awarded" | "error" | "unavailable" | "idle";
}

export function completionScorePresentation(
  status: CompletionScoreAwardStatus,
  result: AppendScoreEventResult | null,
): CompletionScorePresentation {
  if (status === "ready" && result) {
    return {
      value: result.created
        ? String(result.event.points)
        : `${result.event.points} · bereits gewertet`,
      detail: result.created ? "awarded" : "already_awarded",
    };
  }
  if (status === "pending") return { value: "wird geprüft", detail: "pending" };
  if (status === "error") return { value: "ausstehend", detail: "error" };
  if (status === "unavailable") return { value: "—", detail: "unavailable" };
  return { value: "—", detail: "idle" };
}

export function completionScoreFinishedAt(
  finishedAt: number | null,
  baseline: CompletionSkillProfilesSnapshot,
): number | null {
  return baseline.status === "loading" ? null : finishedAt;
}

export function completionRecommendationRefreshKey(
  status: CompletionScoreAwardStatus,
  result: AppendScoreEventResult | null,
): string {
  return status === "ready" && result
    ? `ready:${result.event.occurredAt}:${result.event.points}:${result.created ? "created" : "existing"}`
    : status;
}

export function completionRecommendationFreshnessBaseline(
  status: CompletionScoreAwardStatus,
  result: AppendScoreEventResult | null,
  baseline: CompletionSkillProfilesSnapshot,
): readonly SkillProfileProjection[] | null {
  if (baseline.status !== "ready") return null;
  if (status !== "ready" || !result?.created) return baseline.profiles;
  return baselinePredatesAward(baseline, result.event.occurredAt) ? baseline.profiles : null;
}

export function shouldWaitForCompletionRecommendation(
  scoreStatus: CompletionScoreAwardStatus,
  scoreResult: AppendScoreEventResult | null,
  recommendationLoading: boolean,
): boolean {
  return (
    scoreStatus === "idle" ||
    scoreStatus === "pending" ||
    (scoreStatus === "ready" && scoreResult === null) ||
    recommendationLoading
  );
}

export interface SkillProfileChange {
  technologyId: string;
  before: SkillProfileProjection | null;
  after: SkillProfileProjection | null;
  levelChanged: boolean;
  pointsChanged: boolean;
  evidenceRevisionChanged: boolean;
}

export type CompletionCompetencyPresentation =
  | { kind: "waiting_for_score" }
  | { kind: "score_error" }
  | { kind: "unavailable" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "already_awarded"; current: readonly SkillProfileProjection[] }
  | { kind: "current_only"; current: readonly SkillProfileProjection[] }
  | { kind: "projection_pending" }
  | { kind: "changed"; changes: readonly SkillProfileChange[] };

function sameLevel(left: SkillLevel | undefined, right: SkillLevel | undefined): boolean {
  return left === right;
}

// A fetched profile is a valid before-state only when the server proves it predates the award.
// Otherwise the completion UI stays fail-closed and never invents a competency delta.
function baselinePredatesAward(
  baseline: CompletionSkillProfilesSnapshot,
  awardOccurredAt: number,
): baseline is CompletionSkillProfilesSnapshot & { status: "ready" } {
  return (
    baseline.status === "ready" &&
    baseline.profiles.length > 0 &&
    baseline.profiles.every((profile) => profile.calculatedAt < awardOccurredAt)
  );
}

function profileChanges(
  baseline: readonly SkillProfileProjection[],
  current: readonly SkillProfileProjection[],
): SkillProfileChange[] {
  const beforeByTechnology = new Map(baseline.map((profile) => [profile.technologyId, profile]));
  const afterByTechnology = new Map(current.map((profile) => [profile.technologyId, profile]));
  const technologyIds = [
    ...new Set([...beforeByTechnology.keys(), ...afterByTechnology.keys()]),
  ].sort();

  return technologyIds.flatMap((technologyId) => {
    const before = beforeByTechnology.get(technologyId) ?? null;
    const after = afterByTechnology.get(technologyId) ?? null;
    const levelChanged = !sameLevel(before?.level, after?.level);
    const pointsChanged = before?.points !== after?.points;
    const evidenceRevisionChanged = before?.sourceRevision !== after?.sourceRevision;
    const evidenceCountChanged = before?.eligibleChallengeCount !== after?.eligibleChallengeCount;

    // `sourceRevision` can advance when the run GSI becomes visible before the score-event GSI.
    // A revision-only change is therefore not yet a trustworthy competency delta.
    if (!levelChanged && !pointsChanged && !evidenceCountChanged) {
      return [];
    }

    return [
      {
        technologyId,
        before,
        after,
        levelChanged,
        pointsChanged,
        evidenceRevisionChanged,
      },
    ];
  });
}

export function completionCompetencyPresentation({
  scoreStatus,
  scoreResult,
  baseline,
  current,
}: {
  scoreStatus: CompletionScoreAwardStatus;
  scoreResult: AppendScoreEventResult | null;
  baseline: CompletionSkillProfilesSnapshot;
  current: CompletionSkillProfilesSnapshot | null;
}): CompletionCompetencyPresentation {
  if (scoreStatus === "unavailable") return { kind: "unavailable" };
  if (scoreStatus === "error") return { kind: "score_error" };
  if (scoreStatus !== "ready" || !scoreResult) return { kind: "waiting_for_score" };

  if (current === null || current.status === "loading") return { kind: "loading" };
  if (current.status === "unavailable") return { kind: "unavailable" };
  if (current.status === "error") return { kind: "error" };

  if (!scoreResult.created) {
    return { kind: "already_awarded", current: current.profiles };
  }

  if (!baselinePredatesAward(baseline, scoreResult.event.occurredAt)) {
    return { kind: "current_only", current: current.profiles };
  }

  const changes = profileChanges(baseline.profiles, current.profiles);
  if (changes.length === 0) return { kind: "projection_pending" };
  return { kind: "changed", changes };
}
