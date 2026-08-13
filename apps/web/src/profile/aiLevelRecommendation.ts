import type { SelfAssessedAiLevel, TrainingMode } from "@ai-train-lab/training-engine";

export interface AiLevelContentRecommendation {
  scenarioId: string;
  mode: TrainingMode;
  title: string;
  reason: string;
}

export function contentRecommendationForAiLevel(
  level: SelfAssessedAiLevel,
): AiLevelContentRecommendation {
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
        scenarioId: "copilot-basics.challenge",
        mode: "challenge",
        title: "GitHub Copilot – Grundlagen · Challenge",
        reason:
          "Steige direkt in eine eigenständigere Challenge ein, in der du KI-Vorschläge kritisch prüfst und bewusst übernimmst.",
      };
  }
}
