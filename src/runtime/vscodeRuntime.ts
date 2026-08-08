import { workspaceBus } from "../state/eventBus.ts";
import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import { getVscodeSurfaceTarget, VSCODE_RUNTIME_DEFINITION } from "./vscodeDefinition.ts";

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

function isRuntimeState(value: unknown): value is RuntimeState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RuntimeState>;
  return (
    (candidate.workspaceMode === "none" ||
      candidate.workspaceMode === "folder" ||
      candidate.workspaceMode === "workspace") &&
    Array.isArray(candidate.folders) &&
    candidate.folders.every((item) => typeof item === "string") &&
    Array.isArray(candidate.files) &&
    candidate.files.every((item) => typeof item === "string") &&
    (candidate.activeFile === null || typeof candidate.activeFile === "string") &&
    (candidate.activePanel === null ||
      candidate.activePanel === "terminal" ||
      candidate.activePanel === "problems" ||
      candidate.activePanel === "output")
  );
}

function cloneState(value: RuntimeState): RuntimeState {
  return {
    ...value,
    folders: [...value.folders],
    files: [...value.files],
  };
}

let state = initialState();
let mountedContainer: ParentNode | null = null;

export const vscodeRuntime = {
  id: VSCODE_RUNTIME_DEFINITION.id,
  productId: VSCODE_RUNTIME_DEFINITION.productId,
  capabilities: ["filesystem", "editor", "terminal", "extensions", "source_control"] as const,

  async mount(container: HTMLElement, _seed?: RuntimeSeed): Promise<void> {
    mountedContainer = container;
  },

  async unmount(): Promise<void> {
    mountedContainer = null;
  },

  subscribe(handler) {
    return workspaceBus.subscribe(handler);
  },

  describeSurface(): RuntimeSurfaceDescription[] {
    return VSCODE_RUNTIME_DEFINITION.surface.map((entry) => ({ ...entry }));
  },

  resolveTarget(ref: UiTargetRef): DOMRect | null {
    if (!getVscodeSurfaceTarget(ref)) return null;
    const root =
      mountedContainer ?? (typeof document === "undefined" ? null : (document as ParentNode));
    if (!root) return null;
    const element = root.querySelector<HTMLElement>(`[data-highlight="${ref}"]`);
    return element?.getBoundingClientRect() ?? null;
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

  async query<T = unknown>(selector: string): Promise<T> {
    let value: unknown;
    switch (selector) {
      case "workspace.contextOpen":
        value = state.workspaceMode !== "none";
        break;
      case "workspace.mode":
        value = state.workspaceMode;
        break;
      case "workspace.folders":
        value = [...state.folders];
        break;
      case "filesystem.files":
        value = [...state.files];
        break;
      case "editor.activeFile":
        value = state.activeFile;
        break;
      case "panel.active":
        value = state.activePanel;
        break;
      default:
        value = undefined;
    }
    return value as T;
  },

  async snapshot(): Promise<unknown> {
    return cloneState(state);
  },

  async restore(snapshot: unknown): Promise<void> {
    if (!isRuntimeState(snapshot)) {
      throw new TypeError("Invalid VS Code runtime snapshot");
    }
    state = cloneState(snapshot);
  },
} satisfies RuntimeAdapter;
