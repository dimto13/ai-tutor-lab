import type {
  AppendScoreEventResult,
  SkillProfileProjection,
} from "@ai-train-lab/training-engine";

export const COMPLETION_PROFILE_AUTO_REFRESH_ATTEMPTS = 5;

const SCORE_POINT_EPSILON = 0.001;

export function completionProfileReflectsCreatedAward({
  award,
  technologyId,
  baselineProfiles,
  currentProfiles,
}: {
  award: AppendScoreEventResult;
  technologyId: string | null;
  baselineProfiles: readonly SkillProfileProjection[];
  currentProfiles: readonly SkillProfileProjection[];
}): boolean {
  if (!award.created) return true;
  if (!technologyId || award.event.points <= 0) return false;

  const before = baselineProfiles.find((profile) => profile.technologyId === technologyId);
  const after = currentProfiles.find((profile) => profile.technologyId === technologyId);
  if (!before || !after) return false;

  // SkillProfile is an eventually-consistent projection over run + score GSIs. A newer
  // sourceRevision alone is insufficient because the run can become visible before the score
  // event. The newly awarded positive points must therefore be visible in the authoritative
  // technology projection before completion exposes a competency-based follow-up action.
  const minimumExpectedPoints = before.points + award.event.points;
  return after.points + SCORE_POINT_EPSILON >= minimumExpectedPoints;
}

export function completionProfileRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(400 * 2 ** normalizedAttempt, 3200);
}
