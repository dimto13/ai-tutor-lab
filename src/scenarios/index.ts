import type { Scenario } from "@/types/training";
import { gitBasicsScenario } from "./git-basics";
import { vscodeBasicsScenario } from "./vscode-basics";

const scenarios: Record<string, Scenario> = {
  [vscodeBasicsScenario.id]: vscodeBasicsScenario,
  [gitBasicsScenario.id]: gitBasicsScenario,
};

export function getScenario(scenarioId: string): Scenario | null {
  return scenarios[scenarioId] ?? null;
}

export function getScenarioIds(): string[] {
  return Object.keys(scenarios);
}
