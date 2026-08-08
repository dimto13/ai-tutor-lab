import { workspaceBus } from "../state/eventBus.ts";
import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import { getVscodeSurfaceTarget, VSCODE_RUNTIME_DEFINITION } from "./vscodeDefinition.ts";

type WorkspaceMode = "none" | "folder" | "workspace";
type PanelName = "terminal" | "problems" | "output" | null;

export interface VscodeRuntimeState {
  workspaceMode: WorkspaceMode;
  folders: string[];
  files: string[];
  contents: Record<string, string>;
  openTabs: string[];
  activeFile: string | null;
  activePanel: PanelName;
}

export type VscodeRuntimeStateChangeReason = "reset" | "mutation" | "restore";

type RuntimeStateListener = (
  state: VscodeRuntimeState,
  reason: VscodeRuntimeStateChangeReason,
) => void;

interface VscodeRuntimeAdapter extends RuntimeAdapter {
  inspect(ref: UiTargetRef): void;
  reset(): void;
  subscribeState(handler: RuntimeStateListener): () => void;
  setWorkspace(mode: Exclude<WorkspaceMode, "none">, folders: string[]): void;
  addFile(filename: string): void;
  setFileContent(filename: string, content: string): void;
  setActiveFile(filename: string | null): void;
  closeFile(filename: string): void;
  setActivePanel(panel: PanelName): void;
}

const initialState = (): VscodeRuntimeState => ({
  workspaceMode: "none",
  folders: [],
  files: ["README.md"],
  contents: {
    "README.md": "# ai-training-demo\n\nDemo-Repository für das AI Training Lab.\n",
  },
  openTabs: [],
  activeFile: null,
  activePanel: null,
});

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isRuntimeState(value: unknown): value is VscodeRuntimeState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VscodeRuntimeState>;
  return (
    (candidate.workspaceMode === "none" ||
      candidate.workspaceMode === "folder" ||
      candidate.workspaceMode === "workspace") &&
    Array.isArray(candidate.folders) &&
    candidate.folders.every((item) => typeof item === "string") &&
    Array.isArray(candidate.files) &&
    candidate.files.every((item) => typeof item === "string") &&
    isStringRecord(candidate.contents) &&
    Array.isArray(candidate.openTabs) &&
    candidate.openTabs.every((item) => typeof item === "string") &&
    (candidate.activeFile === null || typeof candidate.activeFile === "string") &&
    (candidate.activePanel === null ||
      candidate.activePanel === "terminal" ||
      candidate.activePanel === "problems" ||
      candidate.activePanel === "output")
  );
}

function cloneState(value: VscodeRuntimeState): VscodeRuntimeState {
  return {
    ...value,
    folders: [...value.folders],
    files: [...value.files],
    contents: { ...value.contents },
    openTabs: [...value.openTabs],
  };
}

let state = initialState();
let mountedContainer: ParentNode | null = null;
const stateListeners = new Set<RuntimeStateListener>();

function replaceState(nextState: VscodeRuntimeState, reason: VscodeRuntimeStateChangeReason): void {
  state = cloneState(nextState);
  const snapshot = cloneState(state);
  for (const listener of stateListeners) listener(snapshot, reason);
}

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

  subscribeState(handler: RuntimeStateListener): () => void {
    stateListeners.add(handler);
    return () => stateListeners.delete(handler);
  },

  describeSurface(): RuntimeSurfaceDescription[] {
    return VSCODE_RUNTIME_DEFINITION.surface.map((entry) => ({ ...entry }));
  },

  resolveTarget(ref: UiTargetRef): DOMRect | null {
    if (!getVscodeSurfaceTarget(ref) || !mountedContainer) return null;
    const element = mountedContainer.querySelector<HTMLElement>(`[data-highlight="${ref}"]`);
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
    replaceState(initialState(), "reset");
  },

  setWorkspace(mode: Exclude<WorkspaceMode, "none">, folders: string[]): void {
    replaceState({ ...state, workspaceMode: mode, folders: [...folders] }, "mutation");
  },

  addFile(filename: string): void {
    if (state.files.includes(filename)) return;
    replaceState(
      {
        ...state,
        files: [...state.files, filename],
        contents: { ...state.contents, [filename]: "" },
      },
      "mutation",
    );
  },

  setFileContent(filename: string, content: string): void {
    replaceState(
      {
        ...state,
        contents: { ...state.contents, [filename]: content },
      },
      "mutation",
    );
  },

  setActiveFile(filename: string | null): void {
    replaceState(
      {
        ...state,
        activeFile: filename,
        openTabs:
          filename && !state.openTabs.includes(filename)
            ? [...state.openTabs, filename]
            : state.openTabs,
      },
      "mutation",
    );
  },

  closeFile(filename: string): void {
    replaceState(
      {
        ...state,
        openTabs: state.openTabs.filter((tab) => tab !== filename),
        activeFile: state.activeFile === filename ? null : state.activeFile,
      },
      "mutation",
    );
  },

  setActivePanel(panel: PanelName): void {
    replaceState({ ...state, activePanel: panel }, "mutation");
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
      case "editor.openTabs":
        value = [...state.openTabs];
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
    replaceState(snapshot, "restore");
  },
} satisfies VscodeRuntimeAdapter;
