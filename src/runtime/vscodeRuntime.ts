import { workspaceBus } from "../state/eventBus.ts";
import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import {
  executeTerminalCommand as evaluateTerminalCommand,
  formatTerminalPrompt,
  type TerminalCommit,
} from "./terminalCommandEngine.ts";
import { getVscodeSurfaceTarget, VSCODE_RUNTIME_DEFINITION } from "./vscodeDefinition.ts";

type WorkspaceMode = "none" | "folder" | "workspace";
type PanelName = "terminal" | "problems" | "output" | null;

export interface VscodeRuntimeState {
  workspaceMode: WorkspaceMode;
  folders: string[];
  directories: string[];
  files: string[];
  contents: Record<string, string>;
  openTabs: string[];
  activeFile: string | null;
  activePanel: PanelName;
  terminalLines: string[];
  terminalCommand: string;
  terminalCwd: string;
  trackedFiles: string[];
  scmChangedFiles: string[];
  stagedFiles: string[];
  commits: TerminalCommit[];
  staged: boolean;
  wrongFile: string | null;
  dirtyFiles: string[];
}

export interface VscodeTerminalExecution {
  lines: string[];
  prompt: string;
  staged: boolean;
  exitCode: number;
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
  initializeTerminal(): string[];
  getTerminalPrompt(): string;
  executeTerminalCommand(command: string): VscodeTerminalExecution;
  setTerminalLines(lines: string[]): void;
  setTerminalCommand(command: string): void;
  setStaged(staged: boolean): void;
  setWrongFile(filename: string | null): void;
}

const initialState = (): VscodeRuntimeState => ({
  workspaceMode: "none",
  folders: [],
  directories: ["src", "docs"],
  files: ["README.md"],
  contents: {
    "README.md": "# ai-training-demo\n\nDemo-Repository für das AI Training Lab.\n",
  },
  openTabs: [],
  activeFile: null,
  activePanel: null,
  terminalLines: [],
  terminalCommand: "",
  terminalCwd: "",
  trackedFiles: ["README.md"],
  scmChangedFiles: [],
  stagedFiles: [],
  commits: [],
  staged: false,
  wrongFile: null,
  dirtyFiles: [],
});

const FOCUSABLE_RUNTIME_TARGET =
  "button,input,textarea,select,a[href],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTerminalCommit(value: unknown): value is TerminalCommit {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const commit = value as Partial<TerminalCommit>;
  return (
    typeof commit.hash === "string" &&
    typeof commit.message === "string" &&
    isStringArray(commit.files)
  );
}

function isTerminalCommitArray(value: unknown): value is TerminalCommit[] {
  return Array.isArray(value) && value.every(isTerminalCommit);
}

function isRuntimeState(value: unknown): value is VscodeRuntimeState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VscodeRuntimeState>;
  return (
    (candidate.workspaceMode === "none" ||
      candidate.workspaceMode === "folder" ||
      candidate.workspaceMode === "workspace") &&
    isStringArray(candidate.folders) &&
    isStringArray(candidate.directories) &&
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
    typeof candidate.terminalCwd === "string" &&
    isStringArray(candidate.trackedFiles) &&
    isStringArray(candidate.scmChangedFiles) &&
    isStringArray(candidate.stagedFiles) &&
    isTerminalCommitArray(candidate.commits) &&
    typeof candidate.staged === "boolean" &&
    (candidate.wrongFile === null || typeof candidate.wrongFile === "string") &&
    isStringArray(candidate.dirtyFiles)
  );
}

function cloneState(value: VscodeRuntimeState): VscodeRuntimeState {
  return {
    ...value,
    folders: [...value.folders],
    directories: [...value.directories],
    files: [...value.files],
    contents: { ...value.contents },
    openTabs: [...value.openTabs],
    terminalLines: [...value.terminalLines],
    trackedFiles: [...value.trackedFiles],
    scmChangedFiles: [...value.scmChangedFiles],
    stagedFiles: [...value.stagedFiles],
    commits: value.commits.map((commit) => ({ ...commit, files: [...commit.files] })),
    dirtyFiles: [...value.dirtyFiles],
  };
}

function hasOwn(value: RuntimeSeed, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stringArrayFromSeed(
  seed: RuntimeSeed,
  key:
    | "folders"
    | "directories"
    | "files"
    | "openTabs"
    | "terminalLines"
    | "dirtyFiles"
    | "trackedFiles"
    | "scmChangedFiles"
    | "stagedFiles",
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

function stringFromSeed(
  seed: RuntimeSeed,
  key: "terminalCommand" | "terminalCwd",
  fallback: string,
): string {
  if (!hasOwn(seed, key)) return fallback;
  const value = seed[key];
  if (typeof value !== "string") {
    throw new TypeError(`Invalid VS Code runtime seed field: ${key}`);
  }
  return value;
}

function commitsFromSeed(seed: RuntimeSeed, fallback: TerminalCommit[]): TerminalCommit[] {
  if (!hasOwn(seed, "commits")) {
    return fallback.map((commit) => ({ ...commit, files: [...commit.files] }));
  }
  const value = seed["commits"];
  if (!isTerminalCommitArray(value)) {
    throw new TypeError("Invalid VS Code runtime seed field: commits");
  }
  return value.map((commit) => ({ ...commit, files: [...commit.files] }));
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
  const directories = stringArrayFromSeed(seed, "directories", base.directories);
  const files = stringArrayFromSeed(seed, "files", base.files);
  const openTabs = stringArrayFromSeed(seed, "openTabs", base.openTabs);
  const terminalLines = stringArrayFromSeed(seed, "terminalLines", base.terminalLines);
  const dirtyFiles = stringArrayFromSeed(seed, "dirtyFiles", base.dirtyFiles);
  const trackedFiles = stringArrayFromSeed(seed, "trackedFiles", files);
  const scmChangedFiles = stringArrayFromSeed(seed, "scmChangedFiles", base.scmChangedFiles);
  const seededStaged = booleanFromSeed(seed, "staged", base.staged);
  const stagedFiles = hasOwn(seed, "stagedFiles")
    ? stringArrayFromSeed(seed, "stagedFiles", base.stagedFiles)
    : seededStaged
      ? [...(scmChangedFiles.length ? scmChangedFiles : files)]
      : [];

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
    directories,
    files,
    contents,
    openTabs,
    activeFile,
    activePanel,
    terminalLines,
    terminalCommand: stringFromSeed(seed, "terminalCommand", base.terminalCommand),
    terminalCwd: stringFromSeed(seed, "terminalCwd", base.terminalCwd),
    trackedFiles,
    scmChangedFiles,
    stagedFiles,
    commits: commitsFromSeed(seed, base.commits),
    staged: stagedFiles.length > 0 || seededStaged,
    wrongFile: nullableStringFromSeed(seed, "wrongFile", base.wrongFile),
    dirtyFiles,
  };
}

let state = initialState();
let mountedContainer: HTMLElement | null = null;
let mountedInitialState: VscodeRuntimeState | null = null;
let keyboardContainer: HTMLElement | null = null;
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

function addUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function terminalWorkspaceRoot(): string {
  return state.folders[0]?.trim() || "ai-training-demo";
}

function currentTerminalPrompt(): string {
  return formatTerminalPrompt(terminalWorkspaceRoot(), state.terminalCwd);
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
  element.focus();
  element.click();
  return true;
}

function handlePointerFocus(event: PointerEvent): void {
  if (!mountedContainer) return;
  const target = event.target;
  if (!(target instanceof Element) || target.closest(FOCUSABLE_RUNTIME_TARGET)) return;
  mountedContainer.focus({ preventScroll: true });
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (!mountedContainer || (!event.ctrlKey && !event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();

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
    keyboardContainer?.removeEventListener("keydown", handleKeyboardShortcut, true);
    keyboardContainer?.removeEventListener("pointerdown", handlePointerFocus, true);
    mountedContainer = container;
    keyboardContainer = container;
    container.tabIndex = -1;
    activeSessionId = createIdentifier("session");
    mountedInitialState = stateFromSeed(seed);
    replaceState(mountedInitialState, "mount");
    keyboardContainer.addEventListener("keydown", handleKeyboardShortcut, true);
    keyboardContainer.addEventListener("pointerdown", handlePointerFocus, true);
  },

  async unmount(): Promise<void> {
    keyboardContainer?.removeEventListener("keydown", handleKeyboardShortcut, true);
    keyboardContainer?.removeEventListener("pointerdown", handlePointerFocus, true);
    keyboardContainer = null;
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
    replaceState(
      { ...state, workspaceMode: mode, folders: [...folders], terminalCwd: "" },
      "mutation",
    );
  },

  addFile(filename: string): void {
    if (state.files.includes(filename)) return;
    replaceState(
      {
        ...state,
        files: [...state.files, filename],
        contents: { ...state.contents, [filename]: "" },
        dirtyFiles: [...state.dirtyFiles, filename],
        scmChangedFiles: addUnique(state.scmChangedFiles, filename),
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
        scmChangedFiles: state.files.includes(filename)
          ? addUnique(state.scmChangedFiles, filename)
          : state.scmChangedFiles,
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

  initializeTerminal(): string[] {
    if (state.terminalLines.length > 0) return [...state.terminalLines];
    const terminalLines = ["AI Training Lab – simulierte Shell (bash)"];
    replaceState({ ...state, terminalLines }, "mutation");
    return [...terminalLines];
  },

  getTerminalPrompt(): string {
    return currentTerminalPrompt();
  },

  executeTerminalCommand(rawCommand: string): VscodeTerminalExecution {
    const command = rawCommand.trim();
    const promptBeforeExecution = currentTerminalPrompt();
    const result = evaluateTerminalCommand(command, {
      workspaceRoot: terminalWorkspaceRoot(),
      cwd: state.terminalCwd,
      directories: state.directories,
      files: state.files,
      contents: state.contents,
      trackedFiles: state.trackedFiles,
      changedFiles: state.scmChangedFiles,
      stagedFiles: state.stagedFiles,
      commits: state.commits,
    });
    const terminalLines = result.clear
      ? []
      : [...state.terminalLines, `${promptBeforeExecution} ${command}`, ...result.output];
    const staged = result.stagedFiles.length > 0;
    replaceState(
      {
        ...state,
        terminalLines,
        terminalCommand: "",
        terminalCwd: result.cwd,
        trackedFiles: result.trackedFiles,
        scmChangedFiles: result.changedFiles,
        stagedFiles: result.stagedFiles,
        commits: result.commits,
        staged,
      },
      "mutation",
    );
    workspaceBus.emit("terminal.command.executed", {
      command,
      cwd: result.cwd || ".",
      exitCode: result.exitCode,
      output: result.output.join("\n"),
      staged: result.committed || staged,
      committed: result.committed,
    });
    return {
      lines: [...terminalLines],
      prompt: currentTerminalPrompt(),
      staged,
      exitCode: result.exitCode,
    };
  },

  setTerminalLines(lines: string[]): void {
    replaceState({ ...state, terminalLines: [...lines] }, "mutation");
  },

  setTerminalCommand(command: string): void {
    replaceState({ ...state, terminalCommand: command }, "mutation");
  },

  setStaged(staged: boolean): void {
    const stagedFiles = staged
      ? [...(state.scmChangedFiles.length ? state.scmChangedFiles : state.files)]
      : [];
    replaceState({ ...state, staged, stagedFiles }, "mutation");
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
      case "terminal.cwd":
        value = state.terminalCwd;
        break;
      case "scm.staged":
        value = state.staged;
        break;
      case "scm.stagedFiles":
        value = [...state.stagedFiles];
        break;
      case "scm.changedFiles":
        value = [...state.scmChangedFiles];
        break;
      case "scm.commits":
        value = state.commits.map((commit) => ({ ...commit, files: [...commit.files] }));
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
