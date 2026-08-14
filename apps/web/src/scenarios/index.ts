import type { LearningLayer, Scenario } from "@/types/training";
import { parseScenario } from "./contentLoader";
import { createHtmlPageWorkflowVariants } from "./htmlPageWorkflowVariants";
import { createResearchWorkflowVariants } from "./researchWorkflowVariants";
import vscodeExploreRaw from "../../../../content/scenarios/vscode-basics.explore.json";
import vscodeGuidedRaw from "../../../../content/scenarios/vscode-basics.guided.json";
import vscodeChallengeRaw from "../../../../content/scenarios/vscode-basics.challenge.json";
import vscodeShortcutsChallengeRaw from "../../../../content/scenarios/vscode-shortcuts.challenge.json";
import developerWorkflowExploreRaw from "../../../../content/scenarios/developer-workflow-basics.explore.json";
import developerWorkflowGuidedRaw from "../../../../content/scenarios/developer-workflow-basics.guided.json";
import developerWorkflowChallengeRaw from "../../../../content/scenarios/developer-workflow-basics.challenge.json";
import copilotBasicsExploreRaw from "../../../../content/scenarios/copilot-basics.explore.json";
import copilotBasicsGuidedRaw from "../../../../content/scenarios/copilot-basics.guided.json";
import copilotBasicsChallengeRaw from "../../../../content/scenarios/copilot-basics.challenge.json";
import artifactPreviewFoundationRaw from "../../../../content/scenarios/artifact-preview-foundation.guided.json";
import htmlPageWorkflowGuidedRaw from "../../../../content/scenarios/html-page-workflow.guided.json";
import researchWorkflowGuidedRaw from "../../../../content/scenarios/research-workflow.guided.json";
import sourceControlPlatformExploreRaw from "../../../../content/scenarios/source-control-platform-basics.explore.json";
import sourceControlPlatformGuidedRaw from "../../../../content/scenarios/source-control-platform-basics.guided.json";
import sourceControlPlatformChallengeRaw from "../../../../content/scenarios/source-control-platform-basics.challenge.json";

const vscodeExploreScenario = parseScenario(vscodeExploreRaw);
const vscodeGuidedScenario = parseScenario(vscodeGuidedRaw);
const vscodeChallengeScenario = parseScenario(vscodeChallengeRaw);
const vscodeShortcutsChallengeScenario = parseScenario(vscodeShortcutsChallengeRaw);
const developerWorkflowExploreScenario = parseScenario(developerWorkflowExploreRaw);
const developerWorkflowGuidedScenario = parseScenario(developerWorkflowGuidedRaw);
const developerWorkflowChallengeScenario = parseScenario(developerWorkflowChallengeRaw);
const copilotBasicsExploreScenario = parseScenario(copilotBasicsExploreRaw);
const copilotBasicsGuidedScenario = parseScenario(copilotBasicsGuidedRaw);
const copilotBasicsChallengeScenario = parseScenario(copilotBasicsChallengeRaw);
const artifactPreviewFoundationScenario = parseScenario(artifactPreviewFoundationRaw);
const htmlPageWorkflowGuidedScenario = parseScenario(htmlPageWorkflowGuidedRaw);
const [htmlPageWorkflowExploreScenario, htmlPageWorkflowChallengeScenario] =
  createHtmlPageWorkflowVariants(htmlPageWorkflowGuidedScenario);
const researchWorkflowGuidedScenario = parseScenario(researchWorkflowGuidedRaw);
const [researchWorkflowExploreScenario, researchWorkflowChallengeScenario] =
  createResearchWorkflowVariants(researchWorkflowGuidedScenario);
const sourceControlPlatformExploreScenario = parseScenario(sourceControlPlatformExploreRaw);
const sourceControlPlatformGuidedScenario = parseScenario(sourceControlPlatformGuidedRaw);
const sourceControlPlatformChallengeScenario = parseScenario(sourceControlPlatformChallengeRaw);

const scenarios: Record<string, Scenario> = {
  [vscodeExploreScenario.id]: vscodeExploreScenario,
  [vscodeGuidedScenario.id]: vscodeGuidedScenario,
  [vscodeChallengeScenario.id]: vscodeChallengeScenario,
  [vscodeShortcutsChallengeScenario.id]: vscodeShortcutsChallengeScenario,
  [developerWorkflowExploreScenario.id]: developerWorkflowExploreScenario,
  [developerWorkflowGuidedScenario.id]: developerWorkflowGuidedScenario,
  [developerWorkflowChallengeScenario.id]: developerWorkflowChallengeScenario,
  [copilotBasicsExploreScenario.id]: copilotBasicsExploreScenario,
  [copilotBasicsGuidedScenario.id]: copilotBasicsGuidedScenario,
  [copilotBasicsChallengeScenario.id]: copilotBasicsChallengeScenario,
  [artifactPreviewFoundationScenario.id]: artifactPreviewFoundationScenario,
  [htmlPageWorkflowExploreScenario.id]: htmlPageWorkflowExploreScenario,
  [htmlPageWorkflowGuidedScenario.id]: htmlPageWorkflowGuidedScenario,
  [htmlPageWorkflowChallengeScenario.id]: htmlPageWorkflowChallengeScenario,
  [researchWorkflowExploreScenario.id]: researchWorkflowExploreScenario,
  [researchWorkflowGuidedScenario.id]: researchWorkflowGuidedScenario,
  [researchWorkflowChallengeScenario.id]: researchWorkflowChallengeScenario,
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

export function getScenariosForLearningLayer(learningLayer: LearningLayer): Scenario[] {
  return Object.values(scenarios).filter((scenario) => scenario.learningLayer === learningLayer);
}
