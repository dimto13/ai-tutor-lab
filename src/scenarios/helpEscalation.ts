import type { TrainingStep } from "../types/training.ts";

export type HelpEscalationViolationCode =
  | "empty-action-help"
  | "level-three-shorter"
  | "level-three-duplicate"
  | "level-three-highlight-only";

export interface HelpEscalationViolation {
  code: HelpEscalationViolationCode;
  level: 1 | 2 | 3;
  message: string;
}

const ACTION_MARKERS = [
  "klick",
  "öffn",
  "wähl",
  "tippe",
  "gib ",
  "drück",
  "wechs",
  "nutze",
  "prüf",
  "markier",
  "erstelle",
  "schreib",
  "starte",
  "führ",
  "bestätig",
  "lade",
  "speicher",
  "sende",
  "füge",
  "setze",
  "such",
  "find",
  "aktivier",
  "deaktivier",
  "lege",
  "geh ",
  "navigier",
  "antworte",
  "formulier",
  "vergleich",
  "identifizier",
  "übernimm",
  "akzeptier",
  "verwerf",
  "ziehe",
  "halte",
  "öffne",
];

const HIGHLIGHT_MARKERS = ["hervorgehoben", "markiert", "highlight", "rahmen"];

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

function containsMarker(value: string, markers: readonly string[]): boolean {
  return markers.some((marker) => value.includes(marker));
}

export function validateHelpEscalation(
  step: Pick<TrainingStep, "stepType" | "helpLevels">,
): HelpEscalationViolation[] {
  if (step.stepType === "explanation") return [];

  const levels = step.helpLevels.map(normalize) as [string, string, string];
  const violations: HelpEscalationViolation[] = [];

  levels.forEach((level, index) => {
    if (!level) {
      violations.push({
        code: "empty-action-help",
        level: (index + 1) as 1 | 2 | 3,
        message: `Aktionsschritte benötigen eine nicht-leere Hilfe ${index + 1}.`,
      });
    }
  });

  const levelTwo = levels[1];
  const levelThree = levels[2];
  if (!levelTwo || !levelThree) return violations;

  if (levelThree.length < levelTwo.length) {
    violations.push({
      code: "level-three-shorter",
      level: 3,
      message:
        "Hilfe 3 darf nicht kürzer als Hilfe 2 sein; sie muss die konkreteste Hilfestufe sein.",
    });
  }

  if (levelThree === levelTwo) {
    violations.push({
      code: "level-three-duplicate",
      level: 3,
      message:
        "Hilfe 3 darf Hilfe 2 nicht nur wiederholen; sie muss zusätzliche konkrete Hilfe geben.",
    });
  }

  if (
    containsMarker(levelThree, HIGHLIGHT_MARKERS) &&
    !containsMarker(levelThree, ACTION_MARKERS)
  ) {
    violations.push({
      code: "level-three-highlight-only",
      level: 3,
      message:
        "Hilfe 3 darf nicht nur auf ein Highlight verweisen; sie muss zusätzlich die exakte Handlung nennen.",
    });
  }

  return violations;
}
