import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef } from "../types/training.ts";
import {
  M365_COPILOT_RUNTIME_DEFINITION,
  getM365CopilotSurfaceTarget,
} from "./m365CopilotDefinition.ts";

export type M365GroundingMode = "work" | "web";
export type M365ApprovalDecision = "pending" | "approved" | "rejected";

export interface M365PromptQuality {
  goal: boolean;
  context: boolean;
  audience: boolean;
  tone: boolean;
  outputFormat: boolean;
}

export interface M365CopilotState {
  groundingMode: M365GroundingMode;
  contextSourceIds: string[];
  restrictedSourceAttempted: boolean;
  promptSubmitted: boolean;
  promptQuality: M365PromptQuality;
  responseVisible: boolean;
  factsChecked: boolean;
  unsupportedRejected: boolean;
  approvalDecision: M365ApprovalDecision;
}

type StateChangeReason = "mount" | "reset" | "mutation" | "restore";
type StateListener = (state: M365CopilotState, reason: StateChangeReason) => void;
type EventListener = (event: TrainingEvent) => void;

const ALLOWED_CONTEXT_IDS = new Set(["meeting-notes", "project-brief"]);
const EMPTY_PROMPT_QUALITY: M365PromptQuality = {
  goal: false,
  context: false,
  audience: false,
  tone: false,
  outputFormat: false,
};

function isAllowedContextId(sourceId: unknown): sourceId is string {
  return typeof sourceId === "string" && ALLOWED_CONTEXT_IDS.has(sourceId);
}

function initialState(): M365CopilotState {
  return {
    groundingMode: "work",
    contextSourceIds: [],
    restrictedSourceAttempted: false,
    promptSubmitted: false,
    promptQuality: { ...EMPTY_PROMPT_QUALITY },
    responseVisible: false,
    factsChecked: false,
    unsupportedRejected: false,
    approvalDecision: "pending",
  };
}

function cloneState(state: M365CopilotState): M365CopilotState {
  return {
    ...state,
    contextSourceIds: [...state.contextSourceIds],
    promptQuality: { ...state.promptQuality },
  };
}

function promptQualityComplete(quality: M365PromptQuality): boolean {
  return Object.values(quality).every(Boolean);
}

function isPromptQuality(value: unknown): value is M365PromptQuality {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<M365PromptQuality>;
  return (
    typeof candidate.goal === "boolean" &&
    typeof candidate.context === "boolean" &&
    typeof candidate.audience === "boolean" &&
    typeof candidate.tone === "boolean" &&
    typeof candidate.outputFormat === "boolean"
  );
}

function isRuntimeState(value: unknown): value is M365CopilotState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<M365CopilotState>;
  return (
    (candidate.groundingMode === "work" || candidate.groundingMode === "web") &&
    Array.isArray(candidate.contextSourceIds) &&
    candidate.contextSourceIds.every(isAllowedContextId) &&
    typeof candidate.restrictedSourceAttempted === "boolean" &&
    typeof candidate.promptSubmitted === "boolean" &&
    isPromptQuality(candidate.promptQuality) &&
    typeof candidate.responseVisible === "boolean" &&
    typeof candidate.factsChecked === "boolean" &&
    typeof candidate.unsupportedRejected === "boolean" &&
    (candidate.approvalDecision === "pending" ||
      candidate.approvalDecision === "approved" ||
      candidate.approvalDecision === "rejected")
  );
}

let sequence = 0;
function id(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

export interface M365CopilotRuntimeAdapter extends RuntimeAdapter {
  subscribeState(handler: StateListener): () => void;
  setGroundingMode(mode: M365GroundingMode): void;
  setContextSource(sourceId: string, selected: boolean): void;
  submitPrompt(quality: M365PromptQuality): void;
  markFactsChecked(): void;
  rejectUnsupportedSuggestion(): void;
  decideApproval(decision: Exclude<M365ApprovalDecision, "pending">): void;
  reset(): void;
}

export function createM365CopilotRuntime(): M365CopilotRuntimeAdapter {
  let state = initialState();
  let mountedContainer: ParentNode | null = null;
  let sessionId = id("m365-session");
  const eventListeners = new Set<EventListener>();
  const stateListeners = new Set<StateListener>();

  const replaceState = (next: M365CopilotState, reason: StateChangeReason): void => {
    state = cloneState(next);
    const snapshot = cloneState(state);
    for (const listener of stateListeners) listener(snapshot, reason);
  };

  // Privacy contract: telemetry contains semantic action metadata and synthetic fixture IDs only.
  // Prompt text and source bodies never leave the simulated product surface.
  const emit = (type: string, payload: Record<string, unknown>): void => {
    const event: TrainingEvent = {
      id: id("m365-event"),
      source: M365_COPILOT_RUNTIME_DEFINITION.id,
      type,
      timestamp: new Date().toISOString(),
      sessionId,
      payload,
    };
    for (const listener of eventListeners) listener(event);
  };

  const inspect = (ref: UiTargetRef): void => {
    const target = getM365CopilotSurfaceTarget(ref);
    if (!target) return;
    emit("ui.element.inspected", { ref, label: target.label, conceptKey: target.conceptKey });
  };

  return {
    id: M365_COPILOT_RUNTIME_DEFINITION.id,
    productId: M365_COPILOT_RUNTIME_DEFINITION.productId,
    capabilities: ["chat", "editor"] as const,

    async mount(container: HTMLElement, _seed?: RuntimeSeed) {
      mountedContainer = container;
      sessionId = id("m365-session");
      replaceState(initialState(), "mount");
    },

    async unmount() {
      mountedContainer = null;
    },

    subscribe(handler) {
      eventListeners.add(handler);
      return () => eventListeners.delete(handler);
    },

    subscribeState(handler) {
      stateListeners.add(handler);
      return () => stateListeners.delete(handler);
    },

    subscribeStateChange(handler) {
      return this.subscribeState((_next, reason) => handler({ reason }));
    },

    async query<T = unknown>(selector: string): Promise<T> {
      const value: unknown = (() => {
        switch (selector) {
          case "m365.grounding.mode":
            return state.groundingMode;
          case "m365.context.sourceCount":
            return state.contextSourceIds.length;
          case "m365.context.restrictedAttempted":
            return state.restrictedSourceAttempted;
          case "m365.prompt.submitted":
            return state.promptSubmitted;
          case "m365.prompt.qualityComplete":
            return promptQualityComplete(state.promptQuality);
          case "m365.chat.responseVisible":
            return state.responseVisible;
          case "m365.review.factsChecked":
            return state.factsChecked;
          case "m365.review.unsupportedRejected":
            return state.unsupportedRejected;
          case "m365.approval.decision":
            return state.approvalDecision;
          default:
            return undefined;
        }
      })();
      return value as T;
    },

    resolveTarget(ref: UiTargetRef): DOMRect | null {
      if (!mountedContainer || !getM365CopilotSurfaceTarget(ref)) return null;
      const element = mountedContainer.querySelector<HTMLElement>(`[data-runtime-target="${ref}"]`);
      return element?.getBoundingClientRect() ?? null;
    },

    describeSurface(): RuntimeSurfaceDescription[] {
      return [...M365_COPILOT_RUNTIME_DEFINITION.surface];
    },

    async snapshot(): Promise<M365CopilotState> {
      return cloneState(state);
    },

    async restore(snapshot: unknown): Promise<void> {
      if (!isRuntimeState(snapshot)) return;
      replaceState(snapshot, "restore");
    },

    setGroundingMode(mode) {
      replaceState({ ...state, groundingMode: mode }, "mutation");
      inspect("m365.grounding");
      emit("m365.grounding.changed", { mode });
    },

    setContextSource(sourceId, selected) {
      inspect(sourceId === "restricted-appendix" ? "m365.context.restricted" : "m365.context");
      if (selected && !isAllowedContextId(sourceId)) {
        replaceState({ ...state, restrictedSourceAttempted: true }, "mutation");
        emit("m365.context.denied", { sourceId });
        return;
      }
      const sourceIds = new Set(state.contextSourceIds);
      if (selected) sourceIds.add(sourceId);
      else sourceIds.delete(sourceId);
      replaceState({ ...state, contextSourceIds: [...sourceIds].sort() }, "mutation");
      emit("m365.context.changed", { sourceId, selected });
    },

    submitPrompt(quality) {
      replaceState(
        {
          ...state,
          promptSubmitted: true,
          promptQuality: { ...quality },
          responseVisible: true,
          approvalDecision: "pending",
        },
        "mutation",
      );
      inspect("m365.prompt");
      inspect("m365.result");
      emit("m365.prompt.submitted", {
        qualityComplete: promptQualityComplete(quality),
        contextSourceCount: state.contextSourceIds.length,
        groundingMode: state.groundingMode,
      });
    },

    markFactsChecked() {
      replaceState({ ...state, factsChecked: true }, "mutation");
      inspect("m365.review.facts");
      emit("m365.review.facts.checked", { checked: true });
    },

    rejectUnsupportedSuggestion() {
      replaceState({ ...state, unsupportedRejected: true }, "mutation");
      inspect("m365.unsupported.reject");
      emit("m365.review.unsupported.rejected", { rejected: true });
    },

    decideApproval(decision) {
      replaceState({ ...state, approvalDecision: decision }, "mutation");
      inspect("m365.approval");
      emit("m365.approval.decided", { decision });
    },

    reset() {
      replaceState(initialState(), "reset");
    },
  };
}

export const m365CopilotRuntime = createM365CopilotRuntime();
