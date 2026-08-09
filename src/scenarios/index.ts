import type { Scenario } from "@/types/training";
import { parseScenario } from "./contentLoader";
import vscodeExploreRaw from "../../content/scenarios/vscode-basics.explore.json";
import vscodeGuidedRaw from "../../content/scenarios/vscode-basics.guided.json";
import vscodeChallengeRaw from "../../content/scenarios/vscode-basics.challenge.json";
import vscodeShortcutsChallengeRaw from "../../content/scenarios/vscode-shortcuts.challenge.json";
import developerWorkflowRaw from "../../content/scenarios/developer-workflow-basics.guided.json";
import copilotBasicsRaw from "../../content/scenarios/copilot-basics.guided.json";
import artifactPreviewFoundationRaw from "../../content/scenarios/artifact-preview-foundation.guided.json";
import sourceControlPlatformExploreRaw from "../../content/scenarios/source-control-platform-basics.explore.json";
import sourceControlPlatformGuidedRaw from "../../content/scenarios/source-control-platform-basics.guided.json";
import sourceControlPlatformChallengeRaw from "../../content/scenarios/source-control-platform-basics.challenge.json";

const vscodeExploreScenario = parseScenario(vscodeExploreRaw);
const vscodeGuidedScenario = parseScenario(vscodeGuidedRaw);
const vscodeChallengeScenario = parseScenario(vscodeChallengeRaw);
const vscodeShortcutsChallengeScenario = parseScenario(vscodeShortcutsChallengeRaw);
const developerWorkflowScenario = parseScenario(developerWorkflowRaw);
const copilotBasicsScenario = parseScenario(copilotBasicsRaw);
const artifactPreviewFoundationScenario = parseScenario(artifactPreviewFoundationRaw);
const sourceControlPlatformExploreScenario = parseScenario(sourceControlPlatformExploreRaw);
const sourceControlPlatformGuidedScenario = parseScenario(sourceControlPlatformGuidedRaw);
const sourceControlPlatformChallengeScenario = parseScenario(sourceControlPlatformChallengeRaw);

const scenarios: Record<string, Scenario> = {
  [vscodeExploreScenario.id]: vscodeExploreScenario,
  [vscodeGuidedScenario.id]: vscodeGuidedScenario,
  [vscodeChallengeScenario.id]: vscodeChallengeScenario,
  [vscodeShortcutsChallengeScenario.id]: vscodeShortcutsChallengeScenario,
  [developerWorkflowScenario.id]: developerWorkflowScenario,
  [copilotBasicsScenario.id]: copilotBasicsScenario,
  [artifactPreviewFoundationScenario.id]: artifactPreviewFoundationScenario,
  [sourceControlPlatformExploreScenario.id]: sourceControlPlatformExploreScenario,
  [sourceControlPlatformGuidedScenario.id]: sourceControlPlatformGuidedScenario,
  [sourceControlPlatformChallengeScenario.id]: sourceControlPlatformChallengeScenario,
};

export function getScenario(scenarioId: string): Scenario | null {
  return scenarios[scenarioId] ?? null;
}

export function getScenarioIds(): string[] {
  return Object.keys(scenarios);
}

export function getScenariosForModule(moduleId: string): Scenario[] {
  return Object.values(scenarios).filter((scenario) => scenario.moduleId === moduleId);
}
