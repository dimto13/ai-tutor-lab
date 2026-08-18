import type { SkillProfileProjection } from "@ai-train-lab/training-engine";

export const RECOMMENDATION_PROFILE_AUTO_REFRESH_ATTEMPTS = 5;

export function requiresFreshRecommendationEvidence(refreshKey: unknown): boolean {
  return typeof refreshKey === "string" && refreshKey.endsWith(":created");
}

export function materialSkillProfileEvidenceChanged(
  before: readonly SkillProfileProjection[],
  after: readonly SkillProfileProjection[],
): boolean {
  const beforeByTechnology = new Map(before.map((profile) => [profile.technologyId, profile]));
  const afterByTechnology = new Map(after.map((profile) => [profile.technologyId, profile]));
  const technologyIds = new Set([...beforeByTechnology.keys(), ...afterByTechnology.keys()]);

  for (const technologyId of technologyIds) {
    const previous = beforeByTechnology.get(technologyId);
    const current = afterByTechnology.get(technologyId);
    if (!previous || !current) return true;
    if (previous.points !== current.points) return true;
    if (previous.level !== current.level) return true;
    if (previous.eligibleChallengeCount !== current.eligibleChallengeCount) return true;
  }

  return false;
}

export function recommendationProfileRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(400 * 2 ** normalizedAttempt, 3200);
}
