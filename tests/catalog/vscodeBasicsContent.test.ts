import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

interface LearningObjectiveCatalog {
  objectives: Array<{ id: string }>;
}

interface Scenario {
  learningObjectives: string[];
  exploreTargets?: string[];
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
