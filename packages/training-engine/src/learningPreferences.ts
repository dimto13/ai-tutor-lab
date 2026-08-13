import type { TrainingMode } from "./types.ts";

export const SELF_ASSESSED_AI_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type SelfAssessedAiLevel = (typeof SELF_ASSESSED_AI_LEVELS)[number];

export interface LearningPreferences {
  selfAssessedAiLevel: SelfAssessedAiLevel | null;
}

export type ExplanationDepth = "foundational" | "balanced" | "concise";
export type ChallengeIntensity = "introductory" | "standard" | "high";

export interface LearningAdaptation {
  explanationDepth: ExplanationDepth;
  preferredEntryMode: TrainingMode;
  challengeIntensity: ChallengeIntensity;
}

export function isSelfAssessedAiLevel(value: unknown): value is SelfAssessedAiLevel {
  return SELF_ASSESSED_AI_LEVELS.some((level) => level === value);
}

export function explanationDepthForSelfAssessedAiLevel(
  level: SelfAssessedAiLevel,
): ExplanationDepth {
  return adaptationForSelfAssessedAiLevel(level).explanationDepth;
}

export function adaptationForSelfAssessedAiLevel(level: SelfAssessedAiLevel): LearningAdaptation {
  switch (level) {
    case "beginner":
      return {
        explanationDepth: "foundational",
        preferredEntryMode: "guided",
        challengeIntensity: "introductory",
      };
    case "intermediate":
      return {
        explanationDepth: "balanced",
        preferredEntryMode: "guided",
        challengeIntensity: "standard",
      };
    case "advanced":
      return {
        explanationDepth: "concise",
        preferredEntryMode: "challenge",
        challengeIntensity: "high",
      };
  }
}
