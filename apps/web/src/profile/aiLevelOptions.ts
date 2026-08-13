import type { SelfAssessedAiLevel } from "@ai-train-lab/training-engine";

export interface AiLevelOption {
  value: SelfAssessedAiLevel;
  label: string;
  description: string;
}

export const AI_LEVEL_OPTIONS: readonly AiLevelOption[] = [
  {
    value: "beginner",
    label: "Anfänger",
    description: "Wenig oder keine praktische Erfahrung mit KI-Werkzeugen.",
  },
  {
    value: "intermediate",
    label: "Fortgeschritten",
    description: "Regelmäßige KI-Nutzung und erste strukturierte Workflows.",
  },
  {
    value: "advanced",
    label: "Erfahren",
    description: "Sichere praktische Nutzung und Interesse an komplexeren KI-Workflows.",
  },
] as const;

export function aiLevelLabel(level: SelfAssessedAiLevel): string {
  return AI_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? level;
}
