import type { SkillProfileProjection } from "@ai-train-lab/training-engine";

export const RECOMMENDATION_PROFILE_AUTO_REFRESH_ATTEMPTS = 5;

export function requiresFreshRecommendationEvidence(refreshKey: unknown): boolean {
  return typeof refreshKey === "string" && refreshKey.endsWith(":created");
}

function profileEvidenceChanged(
  before: SkillProfileProjection | undefined,
  after: SkillProfileProjection | undefined,
): boolean {
  if (!before || !after) return before !== after;
  return (
    before.points !== after.points ||
    before.level !== after.level ||
    before.eligibleChallengeCount !== after.eligibleChallengeCount
  );
}

export function materialSkillProfileEvidenceChanged(
  before: readonly SkillProfileProjection[],
  after: readonly SkillProfileProjection[],
  technologyId?: string | null,
): boolean {
  const beforeByTechnology = new Map(before.map((profile) => [profile.technologyId, profile]));
  const afterByTechnology = new Map(after.map((profile) => [profile.technologyId, profile]));

  if (technologyId) {
    return profileEvidenceChanged(
      beforeByTechnology.get(technologyId),
      afterByTechnology.get(technologyId),
    );
  }

  const technologyIds = new Set([...beforeByTechnology.keys(), ...afterByTechnology.keys()]);
  for (const candidateTechnologyId of technologyIds) {
    if (
      profileEvidenceChanged(
        beforeByTechnology.get(candidateTechnologyId),
        afterByTechnology.get(candidateTechnologyId),
      )
    ) {
      return true;
    }
  }

  return false;
}

export function recommendationProfileRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(400 * 2 ** normalizedAttempt, 3200);
}
