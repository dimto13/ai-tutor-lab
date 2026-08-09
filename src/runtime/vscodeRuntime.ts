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
  terminalLines: string[];
  terminalCommand: string;
  staged: boolean;
  wrongFile: string | null;
  dirtyFiles: string[];
}

export type VscodeRuntimeStateChangeReason = "mount" | "reset" | "mutation" | "restore";

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
  saveFile(filename: string): void;
  setActiveFile(filename: string | null): void;
  closeFile(filename: string): void;
  setActivePanel(panel: PanelName): void;
  setTerminalLines(lines: string[]): void;
  setTerminalCommand(command: string): void;
  setStaged(staged: boolean): void;
  setWrongFile(filename: string | null): void;
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
  terminalLines: [],
  terminalCommand: "",
  staged: false,
  wrongFile: null,
  dirtyFiles: [],
});

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRuntimeState(value: unknown): value is VscodeRuntimeState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VscodeRuntimeState>;
  return (
    (candidate.workspaceMode === "none" ||
      candidate.workspaceMode === "folder" ||
      candidate.workspaceMode === "workspace") &&
    isStringArray(candidate.folders) &&
    isStringArray(candidate.files) &&
    isStringRecord(candidate.contents) &&
    isStringArray(candidate.openTabs) &&
    (candidate.activeFile === null || typeof candidate.activeFile === "string") &&
    (candidate.activePanel === null ||
      candidate.activePanel === "terminal" ||
      candidate.activePanel === "problems" ||
      candidate.activePanel === "output") &&
    isStringArray(candidate.terminalLines) &&
    typeof candidate.terminalCommand === "string" &&
    typeof candidate.staged === "boolean" &&
    (candidate.wrongFile === null || typeof candidate.wrongFile === "string") &&
    isStringArray(candidate.dirtyFiles)
  );
}

function cloneState(value: VscodeRuntimeState): VscodeRuntimeState {
  return {
    ...value,
    folders: [...value.folders],
    files: [...value.files],
    contents: { ...value.contents },
    openTabs: [...value.openTabs],
    terminalLines: [...value.terminalLines],
    dirtyFiles: [...value.dirtyFiles],
  };
}

function hasOwn(value: RuntimeSeed, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stringArrayFromSeed(
  seed: RuntimeSeed,
  key: "folders" | "files" | "openTabs" | "terminalLines" | "dirtyFiles",
  fallback: string[],
): string[] {
  if (!hasOwn(seed, key)) return [...fallback];
  const value = seed[key];
  if (!isStringArray(value)) {
    throw new TypeError(`Invalid VS Code runtime seed field: ${key}`);
  }
  return [...new Set(value)];
}

function nullableStringFromSeed(
  seed: RuntimeSeed,
  key: "activeFile" | "wrongFile",
  fallback: string | null,
): string | null {
  if (!hasOwn(seed, key)) return fallback;
  const value = seed[key];
  if (value !== null && typeof value !== "string") {
    throw new TypeError(`Invalid VS Code runtime seed field: ${key}`);
  }
  return value;
}

function stringFromSeed(seed: RuntimeSeed, key: "terminalCommand", fallback: string): string {
  if (!hasOwn(seed, key)) return fallback;
  const value = seed[key];
  if (typeof value !== "string") {
    throw new TypeError(`Invalid VS Code runtime seed field: ${key}`);
  }
  return value;
}

function booleanFromSeed(seed: RuntimeSeed, key: "staged", fallback: boolean): boolean {
  if (!hasOwn(seed, key)) return fallback;
  const value = seed[key];
  if (typeof value !== "boolean") {
    throw new TypeError(`Invalid VS Code runtime seed field: ${key}`);
  }
  return value;
}

function stateFromSeed(seed?: RuntimeSeed): VscodeRuntimeState {
  const base = initialState();
  if (!seed) return base;

  let workspaceMode = base.workspaceMode;
  if (hasOwn(seed, "workspaceMode")) {
    const value = seed["workspaceMode"];
    if (value !== "none" && value !== "folder" && value !== "workspace") {
      throw new TypeError("Invalid VS Code runtime seed field: workspaceMode");
    }
    workspaceMode = value;
  }

  const folders = stringArrayFromSeed(seed, "folders", base.folders);
  const files = stringArrayFromSeed(seed, "files", base.files);
  const openTabs = stringArrayFromSeed(seed, "openTabs", base.openTabs);
  const terminalLines = stringArrayFromSeed(seed, "terminalLines", base.terminalLines);
  const dirtyFiles = stringArrayFromSeed(seed, "dirtyFiles", base.dirtyFiles);

  let contents = { ...base.contents };
  if (hasOwn(seed, "contents")) {
    const value = seed["contents"];
    if (!isStringRecord(value)) {
      throw new TypeError("Invalid VS Code runtime seed field: contents");
    }
    contents = { ...value };
  }

  const activeFile = nullableStringFromSeed(seed, "activeFile", base.activeFile);

  let activePanel = base.activePanel;
  if (hasOwn(seed, "activePanel")) {
    const value = seed["activePanel"];
    if (value !== null && value !== "terminal" && value !== "problems" && value !== "output") {
      throw new TypeError("Invalid VS Code runtime seed field: activePanel");
    }
    activePanel = value;
  }

  return {
    workspaceMode,
    folders,
    files,
    contents,
    openTabs,
    activeFile,
    activePanel,
    terminalLines,
    terminalCommand: stringFromSeed(seed, "terminalCommand", base.terminalCommand),
    staged: booleanFromSeed(seed, "staged", base.staged),
    wrongFile: nullableStringFromSeed(seed, "wrongFile", base.wrongFile),
    dirtyFiles,
  };
}

let state = initialState();
let mountedContainer: ParentNode | null = null;
let mountedInitialState: VscodeRuntimeState | null = null;
let keyboardDocument: Document | null = null;
const stateListeners = new Set<RuntimeStateListener>();
let identifierSequence = 0;
let activeSessionId = createIdentifier("session");

function createIdentifier(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  identifierSequence += 1;
  return `${prefix}-${Date.now()}-${identifierSequence}`;
}

function replaceState(nextState: VscodeRuntimeState, reason: VscodeRuntimeStateChangeReason): void {
  state = cloneState(nextState);
  const snapshot = cloneState(state);
  for (const listener of stateListeners) listener(snapshot, reason);
}

function saveFile(filename: string): void {
  if (!state.files.includes(filename)) return;
  replaceState(
    { ...state, dirtyFiles: state.dirtyFiles.filter((file) => file !== filename) },
    "mutation",
  );
  workspaceBus.emit("file.saved", { filename });
}

function clickRuntimeTarget(ref: UiTargetRef): boolean {
  if (!mountedContainer) return false;
  const element = mountedContainer.querySelector<HTMLElement>(`[data-highlight="${ref}"]`);
  if (!element) return false;
  element.click();
  return true;
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (!mountedContainer || (!event.ctrlKey && !event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();

  if (key === "n" && !event.shiftKey) {
    if (clickRuntimeTarget("vscode.explorer.newFile")) event.preventDefault();
    return;
  }

  if (key === "s" && !event.shiftKey) {
    if (!state.activeFile) return;
    event.preventDefault();
    saveFile(state.activeFile);
    return;
  }

  if (key === "e" && event.shiftKey) {
    if (clickRuntimeTarget("vscode.activityBar.explorer")) event.preventDefault();
  }
}

export const vscodeRuntime = {
  id: VSCODE_RUNTIME_DEFINITION.id,
  productId: VSCODE_RUNTIME_DEFINITION.productId,
  capabilities: ["filesystem", "editor", "terminal", "extensions", "source_control"] as const,

  async mount(container: HTMLElement, seed?: RuntimeSeed): Promise<void> {
    mountedContainer = container;
    activeSessionId = createIdentifier("session");
    mountedInitialState = stateFromSeed(seed);
    replaceState(mountedInitialState, "mount");
    keyboardDocument?.removeEventListener("keydown", handleKeyboardShortcut, true);
    keyboardDocument = container.ownerDocument ?? null;
    keyboardDocument?.addEventListener("keydown", handleKeyboardShortcut, true);
  },

  async unmount(): Promise<void> {
    keyboardDocument?.removeEventListener("keydown", handleKeyboardShortcut, true);
    keyboardDocument = null;
    mountedContainer = null;
    mountedInitialState = null;
  },

  subscribe(handler) {
    return workspaceBus.subscribe((event) => {
      handler({
        id: createIdentifier("event"),
        source: VSCODE_RUNTIME_DEFINITION.id,
        type: event.name,
        timestamp: new Date().toISOString(),
        sessionId: activeSessionId,
        payload: event.payload ?? {},
      });
    });
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
    replaceState(mountedInitialState ?? initialState(), "reset");
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
        dirtyFiles: [...state.dirtyFiles, filename],
      },
      "mutation",
    );
  },

  setFileContent(filename: string, content: string): void {
    replaceState(
      {
        ...state,
        contents: { ...state.contents, [filename]: content },
        dirtyFiles:
          state.files.includes(filename) && !state.dirtyFiles.includes(filename)
            ? [...state.dirtyFiles, filename]
            : state.dirtyFiles,
      },
      "mutation",
    );
  },

  saveFile(filename: string): void {
    saveFile(filename);
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

  setTerminalLines(lines: string[]): void {
    replaceState({ ...state, terminalLines: [...lines] }, "mutation");
  },

  setTerminalCommand(command: string): void {
    replaceState({ ...state, terminalCommand: command }, "mutation");
  },

  setStaged(staged: boolean): void {
    replaceState({ ...state, staged }, "mutation");
  },

  setWrongFile(filename: string | null): void {
    replaceState({ ...state, wrongFile: filename }, "mutation");
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
      case "filesystem.contents":
        value = { ...state.contents };
        break;
      case "editor.activeFile":
        value = state.activeFile;
        break;
      case "editor.openTabs":
        value = [...state.openTabs];
        break;
      case "editor.dirtyFiles":
        value = [...state.dirtyFiles];
        break;
      case "panel.active":
        value = state.activePanel;
        break;
      case "terminal.lines":
        value = [...state.terminalLines];
        break;
      case "scm.staged":
        value = state.staged;
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
