import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface ScenarioLike {
  id?: string;
  title?: string;
  description?: string;
  audience?: {
    personaId?: string;
    glossaryConcepts?: string[];
  };
  steps?: Array<Record<string, unknown>>;
}

interface PersonaDocument {
  personas?: Array<{ id?: string }> | Record<string, unknown>;
}

interface GlossaryDocument {
  concepts?: Array<{ key?: string }>;
}

interface TermRule {
  pattern: RegExp;
  concepts: string[];
  label: string;
}

const scenarioDir = resolve(process.cwd(), "content/scenarios");
const personaPath = resolve(process.cwd(), "content/personas/de.json");
const glossaryDir = resolve(process.cwd(), "content/glossary");

const termRules: TermRule[] = [
  { pattern: /\bActivity Bar\b/i, concepts: ["vscode.activity_bar"], label: "Activity Bar" },
  { pattern: /\bSide Bar\b/i, concepts: ["vscode.side_bar"], label: "Side Bar" },
  { pattern: /\bExplorer\b/i, concepts: ["vscode.explorer"], label: "Explorer" },
  { pattern: /\bEditor\b/i, concepts: ["vscode.editor"], label: "Editor" },
  { pattern: /\bPanel\b/i, concepts: ["vscode.panel"], label: "Panel" },
  { pattern: /\bTerminal\b/i, concepts: ["vscode.terminal"], label: "Terminal" },
  { pattern: /\bWorkspace\b/i, concepts: ["vscode.workspace"], label: "Workspace" },
  { pattern: /\bShortcuts?\b/i, concepts: ["vscode.shortcut"], label: "Shortcut" },
  { pattern: /\bHTML\b/i, concepts: ["web.html"], label: "HTML" },
  { pattern: /\bWorking Tree\b/i, concepts: ["git.working_tree"], label: "Working Tree" },
  { pattern: /\bRemote\b/i, concepts: ["platform.remote"], label: "Remote" },
  { pattern: /\bPython\b|\.py\b/i, concepts: ["programming.python"], label: "Python" },
  {
    pattern: /\bGitHub\b/i,
    concepts: ["github.platform", "github.copilot"],
    label: "GitHub",
  },
  {
    pattern: /\bCopilot\b/i,
    concepts: ["github.copilot"],
    label: "Copilot",
  },
  {
    pattern: /\bRepository\b/i,
    concepts: ["git.repository", "platform.repository"],
    label: "Repository",
  },
  { pattern: /\bBranch\b/i, concepts: ["git.branch"], label: "Branch" },
  {
    pattern: /\bPull Request\b|\bPull Requests\b/i,
    concepts: ["platform.pull_request"],
    label: "Pull Request",
  },
  { pattern: /\bDiff\b/i, concepts: ["platform.diff"], label: "Diff" },
  { pattern: /\bReview\b/i, concepts: ["platform.review"], label: "Review" },
  {
    pattern: /\bStatus Check\b|\bStatus Checks\b|\bChecks\b/i,
    concepts: ["platform.status_checks"],
    label: "Status Checks",
  },
  { pattern: /\bMCP\b/i, concepts: ["copilot.mcp"], label: "MCP" },
  {
    pattern: /\bAgent Skills?\b/i,
    concepts: ["copilot.agent_skill"],
    label: "Agent Skill",
  },
  {
    pattern: /\bInline-Vorschlag\b|\bInline-Vorschläge\b/i,
    concepts: ["copilot.inline_suggestion"],
    label: "Inline-Vorschlag",
  },
  { pattern: /\bArtefakt\b|\bArtefakte\b/i, concepts: ["artifact.preview"], label: "Artefakt" },
];

function collectUserFacingText(scenario: ScenarioLike): string {
  const values: string[] = [scenario.title ?? "", scenario.description ?? ""];
  for (const step of scenario.steps ?? []) {
    for (const key of [
      "title",
      "description",
      "instruction",
      "why",
      "highlightTooltip",
      "successMessage",
    ]) {
      const value = step[key];
      if (typeof value === "string") values.push(value);
    }
    const helpLevels = step.helpLevels;
    if (Array.isArray(helpLevels)) {
      values.push(...helpLevels.filter((value): value is string => typeof value === "string"));
    }
  }
  return values.join("\n");
}

function collectPersonaIds(document: PersonaDocument): Set<string> {
  if (Array.isArray(document.personas)) {
    return new Set(document.personas.flatMap((persona) => (persona.id ? [persona.id] : [])));
  }
  if (document.personas && typeof document.personas === "object") {
    return new Set(Object.keys(document.personas));
  }
  return new Set();
}

const personas = collectPersonaIds(
  JSON.parse(await readFile(personaPath, "utf8")) as PersonaDocument,
);
const glossaryFiles = (await readdir(glossaryDir)).filter((file) => file.endsWith(".json")).sort();
const glossaryKeys = new Set<string>();
for (const file of glossaryFiles) {
  const glossary = JSON.parse(
    await readFile(resolve(glossaryDir, file), "utf8"),
  ) as GlossaryDocument;
  for (const concept of glossary.concepts ?? []) {
    if (concept.key) glossaryKeys.add(concept.key);
  }
}
const scenarioFiles = (await readdir(scenarioDir)).filter((file) => file.endsWith(".json")).sort();
const issues: string[] = [];

for (const file of scenarioFiles) {
  const scenario = JSON.parse(await readFile(resolve(scenarioDir, file), "utf8")) as ScenarioLike;
  const location = `content/scenarios/${file}`;
  const audience = scenario.audience;

  if (!audience?.personaId) {
    issues.push(`${location}: audience.personaId fehlt.`);
    continue;
  }
  if (!personas.has(audience.personaId)) {
    issues.push(`${location}: unbekannte Persona ${audience.personaId}.`);
  }

  const concepts = new Set(audience.glossaryConcepts ?? []);
  if (concepts.size === 0) {
    issues.push(`${location}: audience.glossaryConcepts ist leer oder fehlt.`);
  }
  for (const concept of concepts) {
    if (!glossaryKeys.has(concept)) {
      issues.push(`${location}: unbekannter Glossarbegriff ${concept}.`);
    }
  }

  const text = collectUserFacingText(scenario);
  for (const rule of termRules) {
    if (!rule.pattern.test(text)) continue;
    if (!rule.concepts.some((concept) => concepts.has(concept))) {
      issues.push(
        `${location}: Nutzertext verwendet „${rule.label}“, aber keiner der Glossarbegriffe ${rule.concepts.join(" oder ")} ist im audience-Block verknüpft.`,
      );
    }
  }
}

if (issues.length > 0) {
  console.error("Persona audit validation failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ persona audit: ${scenarioFiles.length} scenarios have audience and glossary coverage`,
  );
}
