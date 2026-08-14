import type { RuntimeSeed } from "@ai-train-lab/runtime-core";
import {
  getTerminalBranchContext,
  resetTerminalBranchContext,
  setTerminalBranchContext,
} from "@ai-train-lab/runtime-terminal-sim";
import type { TrainingEvent } from "@ai-train-lab/training-engine";
import {
  vscodeRuntime as baseVscodeRuntime,
  type VscodeRuntimeState as BaseVscodeRuntimeState,
  type VscodeRuntimeStateChangeReason,
  type VscodeTerminalExecution,
} from "./vscodeRuntime.ts";

export * from "./vscodeDefinition.ts";
export type { VscodeRuntimeStateChangeReason, VscodeTerminalExecution };

export interface TerminalLastResult {
  command: string;
  exitCode: number;
  ok: boolean;
  branch: string;
  output?: string;
  target?: string;
  content?: string;
  saved?: boolean;
}

export interface VscodeRuntimeState extends BaseVscodeRuntimeState {
  branch: string;
  terminalLastResult: TerminalLastResult | null;
  verificationLastResult: TerminalLastResult | null;
}

interface WorkflowRuntimeState {
  branch: string;
  terminalLastResult: TerminalLastResult | null;
  verificationLastResult: TerminalLastResult | null;
  commitOrigin: string | null;
}

interface WorkflowRuntimeSnapshot extends BaseVscodeRuntimeState {
  workflow: WorkflowRuntimeState;
}

type RuntimeStateListener = (
  state: VscodeRuntimeState,
  reason: VscodeRuntimeStateChangeReason,
) => void;
type RuntimeEventListener = (event: TrainingEvent) => void;

const initialWorkflowState = (): WorkflowRuntimeState => ({
  branch: "main",
  terminalLastResult: null,
  verificationLastResult: null,
  commitOrigin: null,
});

let workflowState = initialWorkflowState();
let mountedInitialWorkflowState: WorkflowRuntimeState | null = null;
let latestBaseState: BaseVscodeRuntimeState | null = null;
let bufferTerminalEvents = false;
let queuedTerminalEvents: TrainingEvent[] = [];
const workflowStateListeners = new Set<RuntimeStateListener>();
const runtimeEventListeners = new Set<RuntimeEventListener>();

function cloneTerminalLastResult(value: TerminalLastResult | null): TerminalLastResult | null {
  return value ? { ...value } : null;
}

function cloneWorkflowState(value: WorkflowRuntimeState): WorkflowRuntimeState {
  return {
    branch: value.branch,
    terminalLastResult: cloneTerminalLastResult(value.terminalLastResult),
    verificationLastResult: cloneTerminalLastResult(value.verificationLastResult),
    commitOrigin: value.commitOrigin ?? null,
  };
}

function mergedRuntimeState(base: BaseVscodeRuntimeState): VscodeRuntimeState {
  return {
    ...base,
    branch: workflowState.branch,
    terminalLastResult: cloneTerminalLastResult(workflowState.terminalLastResult),
    verificationLastResult: cloneTerminalLastResult(workflowState.verificationLastResult),
  };
}

function notifyWorkflowState(reason: VscodeRuntimeStateChangeReason): void {
  if (!latestBaseState) return;
  const snapshot = mergedRuntimeState(latestBaseState);
  for (const listener of workflowStateListeners) listener(snapshot, reason);
}

function publishRuntimeEvent(event: TrainingEvent): void {
  for (const listener of runtimeEventListeners) listener(event);
}

function invalidateStaleVerification(runtimeState: BaseVscodeRuntimeState): void {
  const verification = workflowState.verificationLastResult;
  if (!verification?.target || verification.content === undefined) return;
  if (runtimeState.contents[verification.target] === verification.content) return;
  workflowState = { ...workflowState, verificationLastResult: null };
}

baseVscodeRuntime.subscribeState((runtimeState, reason) => {
  invalidateStaleVerification(runtimeState);
  latestBaseState = runtimeState;
  notifyWorkflowState(reason);
});

baseVscodeRuntime.subscribe((event) => {
  if (bufferTerminalEvents) {
    queuedTerminalEvents.push(event);
    return;
  }
  publishRuntimeEvent(event);
});

function workflowStateFromSeed(seed?: RuntimeSeed): WorkflowRuntimeState {
  const initial = initialWorkflowState();
  if (!seed || !Object.prototype.hasOwnProperty.call(seed, "branch")) return initial;
  const branch = seed["branch"];
  if (typeof branch !== "string" || !branch.trim()) {
    throw new TypeError("Invalid VS Code runtime seed field: branch");
  }
  return { ...initial, branch: branch.trim() };
}

function isTerminalLastResult(value: unknown): value is TerminalLastResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<TerminalLastResult>;
  return (
    typeof candidate.command === "string" &&
    typeof candidate.exitCode === "number" &&
    typeof candidate.ok === "boolean" &&
    typeof candidate.branch === "string" &&
    (candidate.output === undefined || typeof candidate.output === "string") &&
    (candidate.target === undefined || typeof candidate.target === "string") &&
    (candidate.content === undefined || typeof candidate.content === "string") &&
    (candidate.saved === undefined || typeof candidate.saved === "boolean")
  );
}

function isWorkflowState(value: unknown): value is WorkflowRuntimeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<WorkflowRuntimeState>;
  return (
    typeof candidate.branch === "string" &&
    (candidate.terminalLastResult === null || isTerminalLastResult(candidate.terminalLastResult)) &&
    (candidate.verificationLastResult === undefined ||
      candidate.verificationLastResult === null ||
      isTerminalLastResult(candidate.verificationLastResult)) &&
    (candidate.commitOrigin === undefined ||
      candidate.commitOrigin === null ||
      typeof candidate.commitOrigin === "string")
  );
}

function isWorkflowSnapshot(value: unknown): value is WorkflowRuntimeSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { workflow?: unknown };
  return isWorkflowState(candidate.workflow);
}

function baseSnapshotFromWorkflowSnapshot(
  snapshot: WorkflowRuntimeSnapshot,
): BaseVscodeRuntimeState {
  const { workflow: _workflow, ...baseSnapshot } = snapshot;
  return baseSnapshot;
}

function verificationTarget(command: string): string | null {
  const [program, rawTarget] = command.trim().split(/\s+/);
  if ((program !== "python" && program !== "python3") || !rawTarget || rawTarget.startsWith("-")) {
    return null;
  }
  return rawTarget.replace(/^\.\//, "");
}

export const vscodeRuntime = {
  ...baseVscodeRuntime,

  async mount(container: HTMLElement, seed?: RuntimeSeed): Promise<void> {
    workflowState = workflowStateFromSeed(seed);
    mountedInitialWorkflowState = cloneWorkflowState(workflowState);
    resetTerminalBranchContext(workflowState.branch);
    await baseVscodeRuntime.mount(container, seed);
  },

  async unmount(): Promise<void> {
    await baseVscodeRuntime.unmount();
    mountedInitialWorkflowState = null;
    latestBaseState = null;
  },

  subscribe(handler: RuntimeEventListener): () => void {
    runtimeEventListeners.add(handler);
    return () => runtimeEventListeners.delete(handler);
  },

  subscribeState(handler: RuntimeStateListener): () => void {
    workflowStateListeners.add(handler);
    return () => workflowStateListeners.delete(handler);
  },

  reset(): void {
    workflowState = cloneWorkflowState(mountedInitialWorkflowState ?? initialWorkflowState());
    resetTerminalBranchContext(workflowState.branch);
    baseVscodeRuntime.reset();
  },

  executeTerminalCommand(command: string): VscodeTerminalExecution {
    setTerminalBranchContext(workflowState.branch);
    bufferTerminalEvents = true;
    queuedTerminalEvents = [];
    let stateUpdated = false;

    try {
      const previousTerminalLineCount = latestBaseState?.terminalLines.length ?? 0;
      const previousCommitCount = latestBaseState?.commits.length ?? 0;
      const execution = baseVscodeRuntime.executeTerminalCommand(command);
      const branch = getTerminalBranchContext();
      const output = execution.lines.slice(previousTerminalLineCount + 1).join("\n");
      const target = verificationTarget(command);
      const terminalLastResult: TerminalLastResult = {
        command: command.trim(),
        exitCode: execution.exitCode,
        ok: execution.exitCode === 0,
        branch,
        output,
      };
      const verificationLastResult = target
        ? {
            ...terminalLastResult,
            target,
            content: latestBaseState?.contents[target] ?? "",
            saved: !(latestBaseState?.dirtyFiles.includes(target) ?? false),
          }
        : workflowState.verificationLastResult?.branch === branch
          ? workflowState.verificationLastResult
          : null;
      const createdVersion = (latestBaseState?.commits.length ?? 0) > previousCommitCount;
      workflowState = {
        branch,
        terminalLastResult,
        verificationLastResult,
        commitOrigin: createdVersion ? branch : workflowState.commitOrigin,
      };
      notifyWorkflowState("mutation");
      stateUpdated = true;
      return execution;
    } finally {
      bufferTerminalEvents = false;
      const events = queuedTerminalEvents;
      queuedTerminalEvents = [];
      if (stateUpdated) {
        for (const event of events) publishRuntimeEvent(event);
      }
    }
  },

  async query<T = unknown>(selector: string): Promise<T> {
    if (selector === "scm.branch") return workflowState.branch as T;
    if (selector === "terminal.lastResult") {
      return cloneTerminalLastResult(workflowState.terminalLastResult) as T;
    }
    if (selector === "verification.lastResult") {
      return cloneTerminalLastResult(workflowState.verificationLastResult) as T;
    }
    if (selector === "verification.lastResult.content") {
      return (workflowState.verificationLastResult?.content ?? null) as T;
    }
    if (selector === "scm.lastCommit.message") {
      const commits = await baseVscodeRuntime.query<Array<{ message: string }>>("scm.commits");
      return (commits.at(-1)?.message ?? null) as T;
    }
    if (selector === "scm.lastCommit.files") {
      const commits = await baseVscodeRuntime.query<Array<{ files: string[] }>>("scm.commits");
      return [...(commits.at(-1)?.files ?? [])] as T;
    }
    if (selector === "scm.lastCommit.fileCount") {
      const commits = await baseVscodeRuntime.query<Array<{ files: string[] }>>("scm.commits");
      return (commits.at(-1)?.files.length ?? 0) as T;
    }
    if (selector === "scm.lastCommit.branch") {
      return workflowState.commitOrigin as T;
    }
    return baseVscodeRuntime.query<T>(selector);
  },

  async snapshot(): Promise<WorkflowRuntimeSnapshot> {
    const baseSnapshot = (await baseVscodeRuntime.snapshot()) as BaseVscodeRuntimeState;
    return {
      ...baseSnapshot,
      workflow: cloneWorkflowState(workflowState),
    };
  },

  async restore(snapshot: unknown): Promise<void> {
    if (isWorkflowSnapshot(snapshot)) {
      workflowState = cloneWorkflowState(snapshot.workflow);
      setTerminalBranchContext(workflowState.branch);
      await baseVscodeRuntime.restore(baseSnapshotFromWorkflowSnapshot(snapshot));
      return;
    }

    workflowState = initialWorkflowState();
    setTerminalBranchContext(workflowState.branch);
    await baseVscodeRuntime.restore(snapshot);
  },
};
