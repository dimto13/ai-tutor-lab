import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

interface LearningObjectiveCatalog {
  objectives: Array<{ id: string }>;
}

interface GlossaryConcept {
  key: string;
  term: string;
  aliases: string[];
}

interface GlossaryCatalog {
  concepts: GlossaryConcept[];
}

interface IntroductionCatalog {
  steps: Array<{
    id: string;
    title: string;
    description: string;
    instruction: string;
  }>;
}

interface Scenario {
  learningObjectives: string[];
  exploreTargets?: string[];
  steps?: Array<{
    description?: string;
    instruction?: string;
    rationale?: string;
    helpLevels?: string[];
  }>;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as T;
}

const objectiveCatalog = readJson<LearningObjectiveCatalog>(
  "../../content/learning-objectives/de.json",
);
const explore = readJson<Scenario>("../../content/scenarios/vscode-basics.explore.json");
const guided = readJson<Scenario>("../../content/scenarios/vscode-basics.guided.json");
const challenge = readJson<Scenario>("../../content/scenarios/vscode-basics.challenge.json");
const introductions = readJson<IntroductionCatalog>("../../content/introductions/de.json");
const glossaryCatalogs = [
  readJson<GlossaryCatalog>("../../content/glossary/de.json"),
  readJson<GlossaryCatalog>("../../content/glossary/vscode-menus.de.json"),
  readJson<GlossaryCatalog>("../../content/glossary/vscode-surfaces.de.json"),
];
const glossaryByKey = new Map<string, GlossaryConcept>(
  glossaryCatalogs
    .flatMap((catalog) => catalog.concepts)
    .map((concept) => [concept.key, concept] as const),
);

test("VS Code basics keeps the #122 competency contract explicit", () => {
  const objectiveIds = new Set(objectiveCatalog.objectives.map((objective) => objective.id));
  const requiredObjectives = [
    "understand_vscode_ui",
    "understand_workspace",
    "create_file",
    "edit_and_save_vscode_file",
    "navigate_vscode",
    "understand_panel_views",
    "configure_vscode",
    "operate_vscode_without_guidance",
    "create_file_in_existing_project",
  ];

  for (const objectiveId of requiredObjectives) {
    assert.ok(objectiveIds.has(objectiveId), `missing VS Code learning objective: ${objectiveId}`);
  }

  const assignedObjectives = new Set([
    ...explore.learningObjectives,
    ...guided.learningObjectives,
    ...challenge.learningObjectives,
  ]);
  assert.ok(
    assignedObjectives.size >= 8,
    `expected at least eight assigned VS Code objectives, got ${assignedObjectives.size}`,
  );
});

test("VS Code Explore keeps the core navigation and orientation surfaces discoverable", () => {
  const objectives = new Set(explore.learningObjectives);
  for (const objectiveId of [
    "understand_vscode_ui",
    "understand_workspace",
    "navigate_vscode",
    "understand_panel_views",
    "configure_vscode",
  ]) {
    assert.ok(objectives.has(objectiveId), `Explore lost objective: ${objectiveId}`);
  }

  const targets = new Set(explore.exploreTargets ?? []);
  for (const target of [
    "vscode.menu.file",
    "vscode.menu.view",
    "vscode.commandPalette",
    "vscode.settings",
    "vscode.activityBar.explorer",
    "vscode.activityBar.search",
    "vscode.activityBar.extensions",
    "vscode.primarySideBar",
    "vscode.editor",
    "vscode.panel.terminal",
    "vscode.panel.problems",
    "vscode.panel.output",
    "vscode.statusBar",
    "vscode.menu.file.openFolder",
    "vscode.menu.file.openWorkspace",
    "vscode.workspace.context",
  ]) {
    assert.ok(targets.has(target), `Explore lost semantic surface: ${target}`);
  }
});

test("VS Code learner-facing glossary keeps German terms with original UI aliases", () => {
  const expectedTerms = [
    ["vscode.view", "Ansicht", "View"],
    ["vscode.panel", "Bereich", "Panel"],
    ["vscode.problems", "Probleme", "Problems"],
    ["vscode.output", "Ausgabe", "Output"],
    ["vscode.settings", "Einstellungen", "Settings"],
    ["vscode.view_menu", "Ansicht-Menü", "View"],
  ] as const;

  for (const [key, germanTerm, englishAlias] of expectedTerms) {
    const concept = glossaryByKey.get(key);
    assert.ok(concept, `missing glossary concept: ${key}`);
    assert.equal(concept.term, germanTerm, `${key} must use the German learner-facing term`);
    assert.ok(
      concept.aliases.includes(englishAlias),
      `${key} must preserve the original UI label as alias: ${englishAlias}`,
    );
  }
});

test("VS Code content introduces German terms once while action labels stay product-accurate", () => {
  const panelIntroduction = introductions.steps.find((step) => step.id === "vscode.ui.panel");
  assert.ok(panelIntroduction, "missing shared Panel introduction");
  assert.match(
    `${panelIntroduction.title} ${panelIntroduction.description}`,
    /Bereich \(Panel\)/,
  );

  const viewIntroduction = introductions.steps.find((step) => step.id === "vscode.ui.view");
  assert.ok(viewIntroduction, "missing shared View introduction");
  assert.match(`${viewIntroduction.title} ${viewIntroduction.description}`, /Ansicht \(View\)/);

  const guidedText = JSON.stringify(guided);
  for (const phrase of ["Ansichten (Views)", "Probleme (Problems)", "Ausgabe (Output)"]) {
    assert.ok(guidedText.includes(phrase), `Guided lost German-first introduction: ${phrase}`);
  }
  for (const productLabel of [
    "File → Open Folder...",
    "Terminal → New Terminal",
    "auf Problems",
    "auf Output",
  ]) {
    assert.ok(guidedText.includes(productLabel), `Guided changed a product action label: ${productLabel}`);
  }

  const exploreText = JSON.stringify(explore);
  for (const phrase of [
    "Suche (Search)",
    "Ansicht-Menü (View)",
    "Einstellungen (Settings)",
    "Erweiterungen (Extensions)",
    "Bereich (Panel)",
  ]) {
    assert.ok(exploreText.includes(phrase), `Explore lost first-use terminology: ${phrase}`);
  }
  for (const productLabel of [
    "File → Preferences",
    "File → Open Folder",
    "File → Open Workspace from File",
    "Command Palette",
    "Problems",
    "Output",
  ]) {
    assert.ok(exploreText.includes(productLabel), `Explore changed a product action label: ${productLabel}`);
  }
});
