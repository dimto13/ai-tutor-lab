import { useCaseGuidanceRules } from "../content/useCaseGuidanceContent.ts";
import type {
  UseCaseGuidanceModule,
  UseCaseGuidanceRule,
} from "../content/useCaseGuidanceContent.ts";

export type UseCaseGuidanceInput = {
  goal: string;
  tools: string;
  constraints: string;
};

export type UseCaseTaskDraft = {
  goal: string;
  currentState: string;
  inputs: string;
  outputFormat: string;
  constraints: string;
  verification: string;
};

export type UseCaseRecommendation = {
  title: string;
  rationale: string;
  modules: readonly UseCaseGuidanceModule[];
  taskDraft: UseCaseTaskDraft;
  checklist: readonly string[];
};

export type UseCaseGuidanceResult =
  | { kind: "clarify"; question: string }
  | { kind: "recommendation"; recommendation: UseCaseRecommendation };

const normalize = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const vagueGoalPattern =
  /^(?:e-?mails?|texte?|daten|code|recherche|dokumente?|automatisierung)[\s.!?,;:]*$/iu;

function ruleMatchesGoal(rule: UseCaseGuidanceRule, goal: string) {
  const normalizedGoal = goal.toLocaleLowerCase("de-DE");
  const tokens: string[] = normalizedGoal.match(/[\p{L}\p{N}_-]+/gu) ?? [];

  return rule.keywords.some((rawKeyword) => {
    const keyword = rawKeyword.toLocaleLowerCase("de-DE");
    if (keyword.endsWith("*")) {
      const stem = keyword.slice(0, -1);
      return tokens.some((token) => token.startsWith(stem));
    }
    if (keyword.includes(" ")) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u").test(
        normalizedGoal,
      );
    }
    return tokens.includes(keyword);
  });
}

function buildTaskDraft(input: Required<UseCaseGuidanceInput>): UseCaseTaskDraft {
  return {
    goal: input.goal,
    currentState: `Heute nutze ich dafür: ${input.tools}.`,
    inputs: "[hier ergänzen: Welche Dateien, Daten oder Systeme werden konkret benötigt?]",
    outputFormat:
      "[hier ergänzen: In welcher Form und welchem Umfang soll das Ergebnis vorliegen?]",
    constraints: input.constraints,
    verification:
      "[hier ergänzen: Woran prüfst du fachlich, dass das Ergebnis korrekt und vollständig ist?]",
  };
}

export function formatTaskDraft(draft: UseCaseTaskDraft): string {
  return [
    `Ziel: ${draft.goal}`,
    `Ausgangslage: ${draft.currentState}`,
    `Eingaben: ${draft.inputs}`,
    `Ergebnisformat: ${draft.outputFormat}`,
    `Randbedingungen: ${draft.constraints}`,
    `Prüfkriterium: ${draft.verification}`,
  ].join("\n");
}

export function evaluateUseCaseGuidance(input: UseCaseGuidanceInput): UseCaseGuidanceResult {
  const goal = normalize(input.goal);
  const tools = normalize(input.tools);
  const constraints = normalize(input.constraints);

  if (!goal || vagueGoalPattern.test(goal)) {
    return {
      kind: "clarify",
      question: "Welches konkrete Arbeitsergebnis möchtest du mit KI erreichen?",
    };
  }
  if (!tools) {
    return {
      kind: "clarify",
      question: "Welche Werkzeuge oder Systeme nutzt du für diese Aufgabe heute?",
    };
  }
  if (!constraints) {
    return {
      kind: "clarify",
      question:
        "Welche Vorgaben sind wichtig, zum Beispiel Datenschutz, Freigaben oder erlaubte Systeme?",
    };
  }

  const matches = useCaseGuidanceRules.filter((rule) => ruleMatchesGoal(rule, goal));
  if (matches.length > 1) {
    return {
      kind: "clarify",
      question:
        "Was steht bei deinem Vorhaben im Vordergrund: Recherche, Dokumentarbeit, Softwareentwicklung oder ein Ablauf zwischen Systemen?",
    };
  }

  const rule = matches[0] ?? useCaseGuidanceRules.find(({ id }) => id === "workflow");
  if (!rule) throw new Error("Missing workflow fallback in use-case guidance content");

  return {
    kind: "recommendation",
    recommendation: {
      title: rule.title,
      rationale: rule.rationale,
      modules: rule.modules,
      taskDraft: buildTaskDraft({ goal, tools, constraints }),
      checklist: rule.checklist,
    },
  };
}
