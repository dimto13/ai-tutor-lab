import { workspaceBus } from "@/state/eventBus";
import type { UiTargetRef } from "@/types/training";

export interface SurfaceDescription {
  ref: UiTargetRef;
  label: string;
  conceptKey: string;
}

type WorkspaceMode = "none" | "folder" | "workspace";
type PanelName = "terminal" | "problems" | "output" | null;

interface RuntimeState {
  workspaceMode: WorkspaceMode;
  folders: string[];
  files: string[];
  activeFile: string | null;
  activePanel: PanelName;
}

const SURFACE: SurfaceDescription[] = [
  { ref: "vscode.menu.file", label: "File-Menü", conceptKey: "vscode.file_menu" },
  { ref: "vscode.activityBar.explorer", label: "Explorer", conceptKey: "vscode.explorer" },
  { ref: "vscode.activityBar.search", label: "Suche", conceptKey: "vscode.search" },
  { ref: "vscode.activityBar.scm", label: "Source Control", conceptKey: "vscode.source_control" },
  { ref: "vscode.activityBar.extensions", label: "Extensions", conceptKey: "vscode.extensions" },
  { ref: "vscode.sideBar", label: "Side Bar", conceptKey: "vscode.side_bar" },
  { ref: "vscode.editor", label: "Editor", conceptKey: "vscode.editor" },
  { ref: "vscode.panel.terminal", label: "Terminal", conceptKey: "vscode.terminal" },
  { ref: "vscode.panel.problems", label: "Problems", conceptKey: "vscode.problems" },
  { ref: "vscode.panel.output", label: "Output", conceptKey: "vscode.output" },
  { ref: "vscode.statusBar", label: "Status Bar", conceptKey: "vscode.status_bar" },
  { ref: "vscode.menu.file.openFolder", label: "Open Folder", conceptKey: "vscode.folder" },
  {
    ref: "vscode.menu.file.openWorkspace",
    label: "Open Workspace",
    conceptKey: "vscode.workspace",
  },
  { ref: "vscode.workspace.context", label: "Workspace-Kontext", conceptKey: "vscode.workspace" },
];

const initialState = (): RuntimeState => ({
  workspaceMode: "none",
  folders: [],
  files: ["README.md"],
  activeFile: null,
  activePanel: null,
});

let state = initialState();

export const vscodeRuntime = {
  id: "vscode-simulator",
  productId: "vscode",

  describeSurface(): SurfaceDescription[] {
    return SURFACE;
  },

  resolveTarget(ref: UiTargetRef): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return document.querySelector<HTMLElement>(`[data-highlight="${ref}"]`);
  },

  inspect(ref: UiTargetRef): void {
    const item = SURFACE.find((entry) => entry.ref === ref);
    if (!item) return;
    workspaceBus.emit("ui.element.inspected", {
      ref,
      label: item.label,
      conceptKey: item.conceptKey,
    });
  },

  reset(): void {
    state = initialState();
  },

  setWorkspace(mode: Exclude<WorkspaceMode, "none">, folders: string[]): void {
    state = { ...state, workspaceMode: mode, folders: [...folders] };
  },

  addFile(filename: string): void {
    state = state.files.includes(filename)
      ? state
      : { ...state, files: [...state.files, filename] };
  },

  setActiveFile(filename: string | null): void {
    state = { ...state, activeFile: filename };
  },

  setActivePanel(panel: Exclude<PanelName, null>): void {
    state = { ...state, activePanel: panel };
  },

  query(selector: string): unknown {
    switch (selector) {
      case "workspace.contextOpen":
        return state.workspaceMode !== "none";
      case "workspace.mode":
        return state.workspaceMode;
      case "workspace.folders":
        return [...state.folders];
      case "filesystem.files":
        return [...state.files];
      case "editor.activeFile":
        return state.activeFile;
      case "panel.active":
        return state.activePanel;
      default:
        return undefined;
    }
  },
};
