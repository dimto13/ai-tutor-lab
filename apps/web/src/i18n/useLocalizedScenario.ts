import { useMemo } from "react";
import type { Scenario } from "@ai-train-lab/training-engine";
import { useLanguage } from "./LanguageContext";
import { localizeScenarioContent } from "./scenarioContent";

/**
 * Display-side localization of a canonical scenario.
 *
 * The training store stays the authoritative, untranslated source for ids,
 * targets, validation and persistence. Surfaces that render scenario text read
 * it through this hook so a language change is visible without touching
 * progress or runtime state. Missing translations fall back to German.
 */
export function useLocalizedScenario(scenario: Scenario): Scenario {
  const { language } = useLanguage();
  return useMemo(() => localizeScenarioContent(scenario, language), [scenario, language]);
}
