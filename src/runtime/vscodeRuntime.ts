import { workspaceBus } from "@/state/eventBus";
import type { UiTargetRef } from "@/types/training";
import {
  getVscodeSurfaceTarget,
  VSCODE_RUNTIME_DEFINITION,
  type RuntimeSurfaceDescription,
} from "./vscodeDefinition";

type WorkspaceMode = "none" | "folder" | "workspace";
type PanelName = "terminal" | "problems" | "output" | null;

interface RuntimeState {
  workspaceMode: WorkspaceMode;
  folders: string[];
  files: string[];
  activeFile: string | null;
  activePanel: PanelName;
}

const initialState = (): RuntimeState => ({
  workspaceMode: "none",
  folders: [],
  files: ["README.md"],
  activeFile: null,
  activePanel: null,
});

let state = initialState();

export const vscodeRuntime = {
  id: VSCODE_RUNTIME_DEFINITION.id,
  productId: VSCODE_RUNTIME_DEFINITION.productId,

  describeSurface(): RuntimeSurfaceDescription[] {
    return [...VSCODE_RUNTIME_DEFINITION.surface];
  },

  resolveTarget(ref: UiTargetRef): HTMLElement | null {
    if (!getVscodeSurfaceTarget(ref) || typeof document === "undefined") return null;
    return document.querySelector<HTMLElement>(`[data-highlight="${ref}"]`);
  },

  inspect(ref: UiTargetRef): void {
    const item = getVscodeSurfaceTarget(ref);
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
