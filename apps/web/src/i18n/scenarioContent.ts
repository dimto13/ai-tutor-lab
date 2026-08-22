import type { Scenario, TrainingStep } from "@ai-train-lab/training-engine";
import vscodeBasicsGuidedEn from "../../../../content/i18n/en/vscode-basics.guided.json" with { type: "json" };
import type { SupportedLanguage } from "./messages";

type StepTranslation = Partial<
  Pick<
    TrainingStep,
    | "title"
    | "description"
    | "instruction"
    | "rationale"
    | "why"
    | "helpLevels"
    | "highlightTooltip"
    | "successMessage"
  >
>;

export type ScenarioTranslation = {
  scenarioId: string;
  title?: string;
  description?: string;
  steps?: Record<string, StepTranslation>;
};

const stringStepFields = [
  "title",
  "description",
  "instruction",
  "rationale",
  "why",
  "highlightTooltip",
  "successMessage",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseScenarioTranslation(value: unknown): ScenarioTranslation {
  if (!isRecord(value)) {
    throw new Error("Scenario translation requires a non-empty scenarioId");
  }
  const scenarioId = value["scenarioId"];
  const title = value["title"];
  const description = value["description"];
  const rawSteps = value["steps"];

  if (typeof scenarioId !== "string" || !scenarioId.trim()) {
    throw new Error("Scenario translation requires a non-empty scenarioId");
  }
  if (title !== undefined && typeof title !== "string") {
    throw new Error(`Scenario translation ${scenarioId}: title must be a string`);
  }
  if (description !== undefined && typeof description !== "string") {
    throw new Error(`Scenario translation ${scenarioId}: description must be a string`);
  }

  let steps: Record<string, StepTranslation> | undefined;
  if (rawSteps !== undefined) {
    if (!isRecord(rawSteps)) {
      throw new Error(`Scenario translation ${scenarioId}: steps must be an object`);
    }
    steps = {};
    for (const [stepId, rawStep] of Object.entries(rawSteps)) {
      if (!stepId.trim() || !isRecord(rawStep)) {
        throw new Error(`Scenario translation ${scenarioId}: invalid step translation`);
      }
      for (const field of stringStepFields) {
        if (rawStep[field] !== undefined && typeof rawStep[field] !== "string") {
          throw new Error(
            `Scenario translation ${scenarioId}/${stepId}: ${field} must be a string`,
          );
        }
      }
      const helpLevels = rawStep["helpLevels"];
      if (
        helpLevels !== undefined &&
        (!Array.isArray(helpLevels) || helpLevels.some((level) => typeof level !== "string"))
      ) {
        throw new Error(`Scenario translation ${scenarioId}/${stepId}: helpLevels must be strings`);
      }
      steps[stepId] = rawStep as StepTranslation;
    }
  }

  return {
    scenarioId,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(steps !== undefined ? { steps } : {}),
  };
}

const englishScenarioTranslations: Record<string, ScenarioTranslation> = (() => {
  const translation = parseScenarioTranslation(vscodeBasicsGuidedEn);
  return { [translation.scenarioId]: translation };
})();

function localizedStep(step: TrainingStep, translation: StepTranslation | undefined): TrainingStep {
  if (!translation) return step;
  return {
    ...step,
    ...(translation.title !== undefined ? { title: translation.title } : {}),
    ...(translation.description !== undefined ? { description: translation.description } : {}),
    ...(translation.instruction !== undefined ? { instruction: translation.instruction } : {}),
    ...(translation.rationale !== undefined ? { rationale: translation.rationale } : {}),
    ...(translation.why !== undefined ? { why: translation.why } : {}),
    ...(translation.helpLevels !== undefined ? { helpLevels: translation.helpLevels } : {}),
    ...(translation.highlightTooltip !== undefined
      ? { highlightTooltip: translation.highlightTooltip }
      : {}),
    ...(translation.successMessage !== undefined
      ? { successMessage: translation.successMessage }
      : {}),
  };
}

export function localizeScenarioContent(scenario: Scenario, language: SupportedLanguage): Scenario {
  if (language === "de") return scenario;
  const translation = englishScenarioTranslations[scenario.id];
  if (!translation || translation.scenarioId !== scenario.id) return scenario;

  const knownStepIds = new Set(scenario.steps.map(({ id }) => id));
  const unknownStepId = Object.keys(translation.steps ?? {}).find(
    (stepId) => !knownStepIds.has(stepId),
  );
  if (unknownStepId) {
    throw new Error(`Scenario translation ${scenario.id}: unknown step ${unknownStepId}`);
  }

  return {
    ...scenario,
    title: translation.title ?? scenario.title,
    description: translation.description ?? scenario.description,
    steps: scenario.steps.map((step) => localizedStep(step, translation.steps?.[step.id])),
  };
}
