import type { TrainingStep } from "../types/training.ts";

export type HelpEscalationViolationCode =
  | "empty-action-help"
  | "level-three-shorter"
  | "level-three-duplicate"
  | "level-three-no-action"
  | "level-three-highlight-only";

export interface HelpEscalationViolation {
  code: HelpEscalationViolationCode;
  level: 1 | 2 | 3;
  message: string;
}

const ACTION_PATTERN =
  /(?<![\p{L}\p{N}])(klicke|öffne|wähle|tippe|gib|drücke|wechsle|nutze|prüfe|markiere|erstelle|schreibe|starte|führe|bestätige|lade|speichere|sende|füge|setze|suche|finde|aktiviere|deaktiviere|lege|gehe|navigiere|antworte|formuliere|vergleiche|identifiziere|übernimm|akzeptiere|verwirf|ziehe|halte|lass|wende|trage|achte|bleibe|sieh|lies|beantworte|bringe)(?![\p{L}\p{N}])/u;

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

  if (!ACTION_PATTERN.test(levelThree)) {
    violations.push({
      code: "level-three-no-action",
      level: 3,
      message: "Hilfe 3 muss eine eindeutige ausführbare Handlungsanweisung enthalten.",
    });
  }

  if (containsMarker(levelThree, HIGHLIGHT_MARKERS) && !ACTION_PATTERN.test(levelThree)) {
    violations.push({
      code: "level-three-highlight-only",
      level: 3,
      message:
        "Hilfe 3 darf nicht nur auf ein Highlight verweisen; sie muss zusätzlich die exakte Handlung nennen.",
    });
  }

  return violations;
}
