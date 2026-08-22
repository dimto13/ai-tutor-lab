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
  if (!isRecord(value) || typeof value.scenarioId !== "string" || !value.scenarioId.trim()) {
    throw new Error("Scenario translation requires a non-empty scenarioId");
  }
  if (value.title !== undefined && typeof value.title !== "string") {
    throw new Error(`Scenario translation ${value.scenarioId}: title must be a string`);
  }
  if (value.description !== undefined && typeof value.description !== "string") {
    throw new Error(`Scenario translation ${value.scenarioId}: description must be a string`);
  }

  let steps: Record<string, StepTranslation> | undefined;
  if (value.steps !== undefined) {
    if (!isRecord(value.steps)) {
      throw new Error(`Scenario translation ${value.scenarioId}: steps must be an object`);
    }
    steps = {};
    for (const [stepId, rawStep] of Object.entries(value.steps)) {
      if (!stepId.trim() || !isRecord(rawStep)) {
        throw new Error(`Scenario translation ${value.scenarioId}: invalid step translation`);
      }
      for (const field of stringStepFields) {
        if (rawStep[field] !== undefined && typeof rawStep[field] !== "string") {
          throw new Error(
            `Scenario translation ${value.scenarioId}/${stepId}: ${field} must be a string`,
          );
        }
      }
      if (
        rawStep.helpLevels !== undefined &&
        (!Array.isArray(rawStep.helpLevels) ||
          rawStep.helpLevels.some((level) => typeof level !== "string"))
      ) {
        throw new Error(
          `Scenario translation ${value.scenarioId}/${stepId}: helpLevels must be strings`,
        );
      }
      steps[stepId] = rawStep as StepTranslation;
    }
  }

  return {
    scenarioId: value.scenarioId,
    ...(value.title !== undefined ? { title: value.title } : {}),
    ...(value.description !== undefined ? { description: value.description } : {}),
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
