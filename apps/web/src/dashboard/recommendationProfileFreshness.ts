import type { SkillProfileProjection } from "@ai-train-lab/training-engine";

export const RECOMMENDATION_PROFILE_AUTO_REFRESH_ATTEMPTS = 5;
const POINT_EPSILON = 0.001;

export function requiresFreshRecommendationEvidence(refreshKey: unknown): boolean {
  return typeof refreshKey === "string" && refreshKey.endsWith(":created");
}

export function recommendationMinimumPointsDelta(refreshKey: unknown): number | null {
  if (!requiresFreshRecommendationEvidence(refreshKey) || typeof refreshKey !== "string") return null;
  const segments = refreshKey.split(":");
  const points = Number(segments.at(-2));
  return Number.isFinite(points) && points > 0 ? points : null;
}

function profileEvidenceChanged(
  before: SkillProfileProjection | undefined,
  after: SkillProfileProjection | undefined,
  minimumPointsDelta?: number | null,
): boolean {
  if (!before || !after) return before !== after;
  if (minimumPointsDelta !== undefined && minimumPointsDelta !== null && minimumPointsDelta > 0) {
    return after.points + POINT_EPSILON >= before.points + minimumPointsDelta;
  }
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
  minimumPointsDelta?: number | null,
): boolean {
  const beforeByTechnology = new Map(before.map((profile) => [profile.technologyId, profile]));
  const afterByTechnology = new Map(after.map((profile) => [profile.technologyId, profile]));

  if (technologyId) {
    return profileEvidenceChanged(
      beforeByTechnology.get(technologyId),
      afterByTechnology.get(technologyId),
      minimumPointsDelta,
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
