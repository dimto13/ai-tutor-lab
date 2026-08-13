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
}

export interface VscodeRuntimeState extends BaseVscodeRuntimeState {
  branch: string;
  terminalLastResult: TerminalLastResult | null;
}

interface WorkflowRuntimeState {
  branch: string;
  terminalLastResult: TerminalLastResult | null;
}

interface WorkflowRuntimeSnapshot {
  schemaVersion: 1;
  runtimeId: "vscode-simulator";
  base: unknown;
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
  };
}

function mergedRuntimeState(base: BaseVscodeRuntimeState): VscodeRuntimeState {
  return {
    ...base,
    branch: workflowState.branch,
    terminalLastResult: cloneTerminalLastResult(workflowState.terminalLastResult),
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

baseVscodeRuntime.subscribeState((runtimeState, reason) => {
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
    typeof candidate.branch === "string"
  );
}

function isWorkflowSnapshot(value: unknown): value is WorkflowRuntimeSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<WorkflowRuntimeSnapshot>;
  const workflow = candidate.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return false;
  const workflowCandidate = workflow as Partial<WorkflowRuntimeState>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.runtimeId === "vscode-simulator" &&
    Object.prototype.hasOwnProperty.call(candidate, "base") &&
    typeof workflowCandidate.branch === "string" &&
    (workflowCandidate.terminalLastResult === null ||
      isTerminalLastResult(workflowCandidate.terminalLastResult))
  );
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
      const execution = baseVscodeRuntime.executeTerminalCommand(command);
      const branch = getTerminalBranchContext();
      workflowState = {
        branch,
        terminalLastResult: {
          command: command.trim(),
          exitCode: execution.exitCode,
          ok: execution.exitCode === 0,
          branch,
        },
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
    return baseVscodeRuntime.query<T>(selector);
  },

  async snapshot(): Promise<WorkflowRuntimeSnapshot> {
    return {
      schemaVersion: 1,
      runtimeId: "vscode-simulator",
      base: await baseVscodeRuntime.snapshot(),
      workflow: cloneWorkflowState(workflowState),
    };
  },

  async restore(snapshot: unknown): Promise<void> {
    if (isWorkflowSnapshot(snapshot)) {
      workflowState = cloneWorkflowState(snapshot.workflow);
      setTerminalBranchContext(workflowState.branch);
      await baseVscodeRuntime.restore(snapshot.base);
      return;
    }

    workflowState = initialWorkflowState();
    setTerminalBranchContext(workflowState.branch);
    await baseVscodeRuntime.restore(snapshot);
  },
};
