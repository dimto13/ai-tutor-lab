import { moduleLineCatalog, selectModuleLineItems } from "@/catalog";
import type { LearningLayer, Scenario } from "@/types/training";
import { parseScenario } from "./contentLoader";
import { createHtmlPageWorkflowVariants } from "./htmlPageWorkflowVariants";
import { createResearchWorkflowVariants } from "./researchWorkflowVariants";
import { createTableDataWorkflowVariants } from "./tableDataWorkflowVariants";
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
import m365CopilotBasicsExploreRaw from "../../../../content/scenarios/m365-copilot-basics.explore.json";
import m365CopilotBasicsGuidedRaw from "../../../../content/scenarios/m365-copilot-basics.guided.json";
import m365CopilotBasicsChallengeRaw from "../../../../content/scenarios/m365-copilot-basics.challenge.json";
import artifactPreviewFoundationRaw from "../../../../content/scenarios/artifact-preview-foundation.guided.json";
import htmlPageWorkflowGuidedRaw from "../../../../content/scenarios/html-page-workflow.guided.json";
import researchWorkflowGuidedRaw from "../../../../content/scenarios/research-workflow.guided.json";
import tableDataWorkflowGuidedRaw from "../../../../content/scenarios/table-data-workflow.guided.json";
import sourceControlPlatformExploreRaw from "../../../../content/scenarios/source-control-platform-basics.explore.json";
import sourceControlPlatformGuidedRaw from "../../../../content/scenarios/source-control-platform-basics.guided.json";
import sourceControlPlatformChallengeRaw from "../../../../content/scenarios/source-control-platform-basics.challenge.json";
import claudeCodeBasicsExploreRaw from "../../../../content/scenarios/claude-code-basics.explore.json";
import claudeCodeBasicsGuidedRaw from "../../../../content/scenarios/claude-code-basics.guided.json";
import claudeCodeBasicsChallengeRaw from "../../../../content/scenarios/claude-code-basics.challenge.json";
import dataClassificationExploreRaw from "../../../../content/scenarios/data-classification-ai-usage.explore.json";
import dataClassificationGuidedRaw from "../../../../content/scenarios/data-classification-ai-usage.guided.json";
import dataClassificationChallengeRaw from "../../../../content/scenarios/data-classification-ai-usage.challenge.json";

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
const m365CopilotBasicsExploreScenario = parseScenario(m365CopilotBasicsExploreRaw);
const m365CopilotBasicsGuidedScenario = parseScenario(m365CopilotBasicsGuidedRaw);
const m365CopilotBasicsChallengeScenario = parseScenario(m365CopilotBasicsChallengeRaw);
const artifactPreviewFoundationScenario = parseScenario(artifactPreviewFoundationRaw);
const htmlPageWorkflowGuidedScenario = parseScenario(htmlPageWorkflowGuidedRaw);
const [htmlPageWorkflowExploreScenario, htmlPageWorkflowChallengeScenario] =
  createHtmlPageWorkflowVariants(htmlPageWorkflowGuidedScenario);
const researchWorkflowGuidedScenario = parseScenario(researchWorkflowGuidedRaw);
const [researchWorkflowExploreScenario, researchWorkflowChallengeScenario] =
  createResearchWorkflowVariants(researchWorkflowGuidedScenario);
const tableDataWorkflowGuidedScenario = parseScenario(tableDataWorkflowGuidedRaw);
const [tableDataWorkflowExploreScenario, tableDataWorkflowChallengeScenario] =
  createTableDataWorkflowVariants(tableDataWorkflowGuidedScenario);
const sourceControlPlatformExploreScenario = parseScenario(sourceControlPlatformExploreRaw);
const sourceControlPlatformGuidedScenario = parseScenario(sourceControlPlatformGuidedRaw);
const sourceControlPlatformChallengeScenario = parseScenario(sourceControlPlatformChallengeRaw);
const claudeCodeBasicsExploreScenario = parseScenario(claudeCodeBasicsExploreRaw);
const claudeCodeBasicsGuidedScenario = parseScenario(claudeCodeBasicsGuidedRaw);
const claudeCodeBasicsChallengeScenario = parseScenario(claudeCodeBasicsChallengeRaw);
const dataClassificationExploreScenario = parseScenario(dataClassificationExploreRaw);
const dataClassificationGuidedScenario = parseScenario(dataClassificationGuidedRaw);
const dataClassificationChallengeScenario = parseScenario(dataClassificationChallengeRaw);

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
  [m365CopilotBasicsExploreScenario.id]: m365CopilotBasicsExploreScenario,
  [m365CopilotBasicsGuidedScenario.id]: m365CopilotBasicsGuidedScenario,
  [m365CopilotBasicsChallengeScenario.id]: m365CopilotBasicsChallengeScenario,
  [artifactPreviewFoundationScenario.id]: artifactPreviewFoundationScenario,
  [htmlPageWorkflowExploreScenario.id]: htmlPageWorkflowExploreScenario,
  [htmlPageWorkflowGuidedScenario.id]: htmlPageWorkflowGuidedScenario,
  [htmlPageWorkflowChallengeScenario.id]: htmlPageWorkflowChallengeScenario,
  [researchWorkflowExploreScenario.id]: researchWorkflowExploreScenario,
  [researchWorkflowGuidedScenario.id]: researchWorkflowGuidedScenario,
  [researchWorkflowChallengeScenario.id]: researchWorkflowChallengeScenario,
  [tableDataWorkflowExploreScenario.id]: tableDataWorkflowExploreScenario,
  [tableDataWorkflowGuidedScenario.id]: tableDataWorkflowGuidedScenario,
  [tableDataWorkflowChallengeScenario.id]: tableDataWorkflowChallengeScenario,
  [sourceControlPlatformExploreScenario.id]: sourceControlPlatformExploreScenario,
  [sourceControlPlatformGuidedScenario.id]: sourceControlPlatformGuidedScenario,
  [sourceControlPlatformChallengeScenario.id]: sourceControlPlatformChallengeScenario,
  [claudeCodeBasicsExploreScenario.id]: claudeCodeBasicsExploreScenario,
  [claudeCodeBasicsGuidedScenario.id]: claudeCodeBasicsGuidedScenario,
  [claudeCodeBasicsChallengeScenario.id]: claudeCodeBasicsChallengeScenario,
  [dataClassificationExploreScenario.id]: dataClassificationExploreScenario,
  [dataClassificationGuidedScenario.id]: dataClassificationGuidedScenario,
  [dataClassificationChallengeScenario.id]: dataClassificationChallengeScenario,
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

export function getScenariosForModuleLine(moduleLineId: string): Scenario[] {
  return selectModuleLineItems(moduleLineCatalog, moduleLineId, Object.values(scenarios));
}
