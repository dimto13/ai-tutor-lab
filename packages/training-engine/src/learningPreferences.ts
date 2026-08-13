import type { TrainingMode } from "./types.ts";

export const SELF_ASSESSED_AI_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type SelfAssessedAiLevel = (typeof SELF_ASSESSED_AI_LEVELS)[number];

export interface LearningPreferences {
  selfAssessedAiLevel: SelfAssessedAiLevel | null;
}

export type ExplanationDepth = "foundational" | "balanced" | "concise";

export interface LearningRecommendation {
  scenarioId: string;
  mode: TrainingMode;
  title: string;
  reason: string;
}

export function isSelfAssessedAiLevel(value: unknown): value is SelfAssessedAiLevel {
  return SELF_ASSESSED_AI_LEVELS.some((level) => level === value);
}

export function explanationDepthForSelfAssessedAiLevel(
  level: SelfAssessedAiLevel,
): ExplanationDepth {
  switch (level) {
    case "beginner":
      return "foundational";
    case "intermediate":
      return "balanced";
    case "advanced":
      return "concise";
  }
}

export function recommendationForSelfAssessedAiLevel(
  level: SelfAssessedAiLevel,
): LearningRecommendation {
  switch (level) {
    case "beginner":
      return {
        scenarioId: "vscode-basics.guided",
        mode: "guided",
        title: "Visual Studio Code – Grundlagen · Guided",
        reason:
          "Starte mit einer klar geführten Einführung, damit Oberfläche, Dateien, Ordner und Workspaces sicher sitzen.",
      };
    case "intermediate":
      return {
        scenarioId: "copilot-basics.guided",
        mode: "guided",
        title: "GitHub Copilot – Grundlagen · Guided",
        reason:
          "Vertiefe strukturierte KI-Nutzung mit kontrolliertem Kontext, Vorschlägen und bewusster Übernahme.",
      };
    case "advanced":
      return {
        scenarioId: "research-workflow.challenge",
        mode: "challenge",
        title: "Mit KI recherchieren und Quellen prüfen · Challenge",
        reason:
          "Nutze einen offenen Workflow mit höherer Eigenständigkeit, Quellenprüfung und fachlicher Ergebnisbewertung.",
      };
  }
}
