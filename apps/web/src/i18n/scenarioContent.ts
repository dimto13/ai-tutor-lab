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

type ScenarioTranslation = {
  scenarioId: string;
  title?: string;
  description?: string;
  steps?: Record<string, StepTranslation>;
};

const englishScenarioTranslations: Record<string, ScenarioTranslation> = {
  [vscodeBasicsGuidedEn.scenarioId]: vscodeBasicsGuidedEn as unknown as ScenarioTranslation,
};

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

  return {
    ...scenario,
    title: translation.title ?? scenario.title,
    description: translation.description ?? scenario.description,
    steps: scenario.steps.map((step) => localizedStep(step, translation.steps?.[step.id])),
  };
}
