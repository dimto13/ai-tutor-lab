import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppendScoreEventResult } from "@ai-train-lab/training-engine";
import { buildDashboardTrainingCandidates } from "@/dashboard/dashboardRecommendationContext";
import { useTrainingRecommendation } from "@/dashboard/useTrainingRecommendation";
import type {
  CompletionScoreAwardStatus,
  CompletionSkillProfilesSnapshot,
} from "./completionOutcome";
import {
  COMPLETION_PROFILE_AUTO_REFRESH_ATTEMPTS,
  completionProfileReflectsCreatedAward,
  completionProfileRetryDelayMs,
} from "./completionRecommendationFreshness";

export type CompletionRecommendationFreshness =
  | "not_required"
  | "refreshing"
  | "confirmed"
  | "unconfirmed";

export function useCompletionRecommendation({
  scenarioId,
  scoreStatus,
  scoreResult,
  competencyBaseline,
}: {
  scenarioId: string;
  scoreStatus: CompletionScoreAwardStatus;
  scoreResult: AppendScoreEventResult | null;
  competencyBaseline: CompletionSkillProfilesSnapshot;
}) {
  const awardRefreshKey =
    scoreStatus === "ready" && scoreResult
      ? `ready:${scoreResult.event.id}:${scoreResult.event.occurredAt}:${scoreResult.created}`
      : scoreStatus;
  const [profileRefreshAttempt, setProfileRefreshAttempt] = useState(0);

  useEffect(() => {
    setProfileRefreshAttempt(0);
  }, [awardRefreshKey, scenarioId]);

  const completedTechnologyId = useMemo(
    () => buildDashboardTrainingCandidates([scenarioId])[0]?.technologyId ?? null,
    [scenarioId],
  );
  const recommendation = useTrainingRecommendation({
    excludeStartScenarioId: scenarioId,
    skillProfilesRefreshKey: `${awardRefreshKey}:${profileRefreshAttempt}`,
  });

  const requiresFreshProjection = scoreStatus === "ready" && scoreResult?.created === true;
  const projectionConfirmed =
    !requiresFreshProjection ||
    (scoreResult !== null &&
      competencyBaseline.status === "ready" &&
      recommendation.skillProfiles.status === "ready" &&
      completionProfileReflectsCreatedAward({
        award: scoreResult,
        technologyId: completedTechnologyId,
        baselineProfiles: competencyBaseline.profiles,
        currentProfiles: recommendation.skillProfiles.profiles,
      }));

  const canRetryProjection =
    requiresFreshProjection &&
    !projectionConfirmed &&
    competencyBaseline.status === "ready" &&
    recommendation.skillProfiles.status !== "loading" &&
    recommendation.skillProfiles.status !== "unavailable" &&
    profileRefreshAttempt < COMPLETION_PROFILE_AUTO_REFRESH_ATTEMPTS;

  useEffect(() => {
    if (!canRetryProjection) return;
    const timer = window.setTimeout(
      () => setProfileRefreshAttempt((current) => current + 1),
      completionProfileRetryDelayMs(profileRefreshAttempt),
    );
    return () => window.clearTimeout(timer);
  }, [canRetryProjection, profileRefreshAttempt]);

  let freshness: CompletionRecommendationFreshness = "not_required";
  if (requiresFreshProjection) {
    if (projectionConfirmed) {
      freshness = "confirmed";
    } else if (
      competencyBaseline.status === "loading" ||
      recommendation.skillProfiles.status === "loading" ||
      canRetryProjection
    ) {
      freshness = "refreshing";
    } else {
      freshness = "unconfirmed";
    }
  }

  const recommendationLoading =
    scoreStatus === "idle" ||
    scoreStatus === "pending" ||
    (scoreStatus === "ready" && scoreResult === null) ||
    recommendation.recommendationLoading ||
    freshness === "refreshing";

  const primaryAction =
    recommendationLoading ||
    (freshness === "unconfirmed" && recommendation.primaryAction?.kind !== "resume")
      ? null
      : recommendation.primaryAction;

  const refreshProfiles = useCallback(() => {
    setProfileRefreshAttempt((current) => current + 1);
  }, []);

  return {
    ...recommendation,
    freshness,
    primaryAction,
    recommendationLoading,
    refreshProfiles,
  };
}
