export type SkillLevel = "novice" | "advanced_beginner" | "practitioner" | "proficient";

export interface SkillLevelThreshold {
  id: SkillLevel;
  minPoints: number;
  requiresEligibleChallenge: boolean;
}

export interface SkillLevelEvidence {
  points: number;
  eligibleChallengeCount: number;
}

export interface SkillProfileProjection extends SkillLevelEvidence {
  technologyId: string;
  level: SkillLevel;
  sourceRevision: number;
  calculatedAt: number;
}

/**
 * Resolves the highest level supported by measured evidence. The policy is supplied by the
 * application/content layer so the generic training engine does not own product or program thresholds.
 */
export function resolveSkillLevel(
  evidence: SkillLevelEvidence,
  thresholds: readonly SkillLevelThreshold[],
): SkillLevel {
  assertSkillEvidence(evidence);
  assertSkillThresholds(thresholds);

  let resolved: SkillLevel = "novice";
  for (const threshold of thresholds) {
    if (evidence.points < threshold.minPoints) continue;
    if (threshold.requiresEligibleChallenge && evidence.eligibleChallengeCount < 1) continue;
    resolved = threshold.id;
  }
  return resolved;
}

export function assertSkillThresholds(thresholds: readonly SkillLevelThreshold[]): void {
  if (thresholds.length !== 4) {
    throw new Error("Skill level policy must define exactly four levels");
  }

  const expectedOrder: SkillLevel[] = [
    "novice",
    "advanced_beginner",
    "practitioner",
    "proficient",
  ];
  let previousPoints = -1;
  for (let index = 0; index < thresholds.length; index += 1) {
    const threshold = thresholds[index];
    if (!threshold || threshold.id !== expectedOrder[index]) {
      throw new Error(`Skill level policy must follow ${expectedOrder.join(" -> ")}`);
    }
    if (!Number.isFinite(threshold.minPoints) || threshold.minPoints < 0) {
      throw new Error(`Invalid minPoints for ${threshold.id}`);
    }
    if (threshold.minPoints <= previousPoints && index > 0) {
      throw new Error("Skill level point thresholds must be strictly increasing");
    }
    previousPoints = threshold.minPoints;
  }
  if (thresholds[0]?.minPoints !== 0) {
    throw new Error("Novice threshold must start at zero points");
  }
}

export function assertSkillEvidence(evidence: SkillLevelEvidence): void {
  if (!Number.isFinite(evidence.points) || evidence.points < 0) {
    throw new Error("Skill profile points must be a finite non-negative number");
  }
  if (!Number.isInteger(evidence.eligibleChallengeCount) || evidence.eligibleChallengeCount < 0) {
    throw new Error("eligibleChallengeCount must be a non-negative integer");
  }
}
