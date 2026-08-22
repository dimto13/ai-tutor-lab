import type { Scenario, TrainingStep } from "@ai-train-lab/training-engine";
import vscodeBasicsGuidedEn from "../../../../content/i18n/en/vscode-basics.guided.json";
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

type ScenarioTranslation = {
  scenarioId: string;
  title?: string;
  description?: string;
  steps?: Record<string, StepTranslation>;
};

const englishScenarioTranslations: Record<string, ScenarioTranslation> = {
  [vscodeBasicsGuidedEn.scenarioId]: vscodeBasicsGuidedEn as ScenarioTranslation,
};

function localizedStep(step: TrainingStep, translation: StepTranslation | undefined): TrainingStep {
  if (!translation) return step;
  return {
    ...step,
    ...translation,
    onFailure: step.onFailure,
    recovery: step.recovery,
    validation: step.validation,
  };
}

export function localizeScenarioContent(scenario: Scenario, language: SupportedLanguage): Scenario {
  if (language === "de") return scenario;
  const translation = englishScenarioTranslations[scenario.id];
  if (!translation || translation.scenarioId !== scenario.id) return scenario;

  return {
    ...scenario,
    title: translation.title ?? scenario.title,
    description: translation.description ?? scenario.description,
    steps: scenario.steps.map((step) => localizedStep(step, translation.steps?.[step.id])),
  };
}
