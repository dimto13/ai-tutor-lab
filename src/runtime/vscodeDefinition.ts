import type { UiTargetRef } from "../types/training.ts";

export interface RuntimeSurfaceDescription {
  ref: UiTargetRef;
  label: string;
  conceptKey: string;
}

export interface RuntimeReferenceDefinition {
  id: string;
  productId: string;
  surface: readonly RuntimeSurfaceDescription[];
  querySelectors: readonly string[];
}

/**
 * Semantic contract for the VS Code simulator.
 *
 * The runtime and CI validator consume the same definition so content cannot
 * drift away from targets or state selectors that the simulator actually exposes.
 */
export const VSCODE_RUNTIME_DEFINITION = {
  id: "vscode-simulator",
  productId: "vscode",
  surface: [
    { ref: "vscode.menu.file", label: "File-Menü", conceptKey: "vscode.file_menu" },
    {
      ref: "vscode.activityBar.explorer",
      label: "Explorer",
      conceptKey: "vscode.explorer",
    },
    { ref: "vscode.activityBar.search", label: "Suche", conceptKey: "vscode.search" },
    {
      ref: "vscode.activityBar.scm",
      label: "Source Control",
      conceptKey: "vscode.source_control",
    },
    {
      ref: "vscode.activityBar.extensions",
      label: "Extensions",
      conceptKey: "vscode.extensions",
    },
    { ref: "vscode.sideBar", label: "Side Bar", conceptKey: "vscode.side_bar" },
    {
      ref: "vscode.explorer.tree",
      label: "Explorer-Dateibaum",
      conceptKey: "vscode.explorer",
    },
    {
      ref: "vscode.explorer.preparedRepository",
      label: "Vorbereitetes Repository",
      conceptKey: "git.repository",
    },
    {
      ref: "vscode.explorer.newFile",
      label: "Neue Datei",
      conceptKey: "vscode.explorer",
    },
    { ref: "vscode.editor", label: "Editor", conceptKey: "vscode.editor" },
    {
      ref: "vscode.editor.copilot",
      label: "Copilot fragen",
      conceptKey: "github.copilot",
    },
    { ref: "vscode.panel.terminal", label: "Terminal", conceptKey: "vscode.terminal" },
    {
      ref: "vscode.panel.terminal.input",
      label: "Terminal-Eingabe",
      conceptKey: "vscode.terminal",
    },
    { ref: "vscode.panel.problems", label: "Problems", conceptKey: "vscode.problems" },
    { ref: "vscode.panel.output", label: "Output", conceptKey: "vscode.output" },
    { ref: "vscode.statusBar", label: "Status Bar", conceptKey: "vscode.status_bar" },
    {
      ref: "vscode.statusBar.terminal",
      label: "Terminal öffnen",
      conceptKey: "vscode.terminal",
    },
    {
      ref: "vscode.menu.file.openFolder",
      label: "Open Folder",
      conceptKey: "vscode.folder",
    },
    {
      ref: "vscode.menu.file.openWorkspace",
      label: "Open Workspace",
      conceptKey: "vscode.workspace",
    },
    {
      ref: "vscode.workspace.context",
      label: "Workspace-Kontext",
      conceptKey: "vscode.workspace",
    },
  ],
  querySelectors: [
    "workspace.contextOpen",
    "workspace.mode",
    "workspace.folders",
    "filesystem.files",
    "editor.activeFile",
    "panel.active",
  ],
} as const satisfies RuntimeReferenceDefinition;

export function getVscodeSurfaceTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return VSCODE_RUNTIME_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
