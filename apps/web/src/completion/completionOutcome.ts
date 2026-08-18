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

function correlatedAwardChange({
  baseline,
  current,
  scoringTechnologyId,
  awardedPoints,
}: {
  baseline: readonly SkillProfileProjection[];
  current: readonly SkillProfileProjection[];
  scoringTechnologyId: string | null | undefined;
  awardedPoints: number;
}): SkillProfileChange | null {
  if (!scoringTechnologyId || awardedPoints <= 0) return null;
  const before = baseline.find((profile) => profile.technologyId === scoringTechnologyId) ?? null;
  const after = current.find((profile) => profile.technologyId === scoringTechnologyId) ?? null;
  if (!before || !after || after.points + 0.001 < before.points + awardedPoints) return null;

  return {
    technologyId: scoringTechnologyId,
    before,
    after,
    levelChanged: !sameLevel(before.level, after.level),
    pointsChanged: before.points !== after.points,
    evidenceRevisionChanged: before.sourceRevision !== after.sourceRevision,
  };
}

export function completionCompetencyPresentation({
  scoreStatus,
  scoreResult,
  baseline,
  current,
  scoringTechnologyId,
}: {
  scoreStatus: CompletionScoreAwardStatus;
  scoreResult: AppendScoreEventResult | null;
  baseline: CompletionSkillProfilesSnapshot;
  current: CompletionSkillProfilesSnapshot | null;
  scoringTechnologyId?: string | null;
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

  const change = correlatedAwardChange({
    baseline: baseline.profiles,
    current: current.profiles,
    scoringTechnologyId,
    awardedPoints: scoreResult.event.points,
  });
  if (!change) return { kind: "projection_pending" };
  return { kind: "changed", changes: [change] };
}
