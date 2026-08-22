import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef } from "../types/training.ts";
import {
  M365_COPILOT_RUNTIME_DEFINITION,
  getM365CopilotSurfaceTarget,
} from "./m365CopilotDefinition.ts";

export type M365App = "teams" | "word" | "outlook";
export type M365DraftKind = "meeting-summary" | "word-draft" | "outlook-draft";
export type M365ApprovalDecision = "pending" | "approved" | "rejected";

export interface M365PromptQuality {
  goal: boolean;
  context: boolean;
  audience: boolean;
  tone: boolean;
  outputFormat: boolean;
}

export interface M365CopilotState {
  activeApp: M365App;
  approvedSourceIds: string[];
  promptSubmitted: boolean;
  promptQuality: M365PromptQuality;
  draftKind: M365DraftKind | null;
  factsChecked: boolean;
  unsupportedRejected: boolean;
  approvalDecision: M365ApprovalDecision;
}

type StateChangeReason = "mount" | "reset" | "mutation" | "restore";
type StateListener = (state: M365CopilotState, reason: StateChangeReason) => void;
type EventListener = (event: TrainingEvent) => void;

const EMPTY_PROMPT_QUALITY: M365PromptQuality = {
  goal: false,
  context: false,
  audience: false,
  tone: false,
  outputFormat: false,
};

function initialState(): M365CopilotState {
  return {
    activeApp: "teams",
    approvedSourceIds: [],
    promptSubmitted: false,
    promptQuality: { ...EMPTY_PROMPT_QUALITY },
    draftKind: null,
    factsChecked: false,
    unsupportedRejected: false,
    approvalDecision: "pending",
  };
}

function cloneState(state: M365CopilotState): M365CopilotState {
  return {
    ...state,
    approvedSourceIds: [...state.approvedSourceIds],
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
    (candidate.activeApp === "teams" ||
      candidate.activeApp === "word" ||
      candidate.activeApp === "outlook") &&
    Array.isArray(candidate.approvedSourceIds) &&
    candidate.approvedSourceIds.every((id) => typeof id === "string") &&
    typeof candidate.promptSubmitted === "boolean" &&
    isPromptQuality(candidate.promptQuality) &&
    (candidate.draftKind === null ||
      candidate.draftKind === "meeting-summary" ||
      candidate.draftKind === "word-draft" ||
      candidate.draftKind === "outlook-draft") &&
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
  selectApp(app: M365App): void;
  setSourceApproved(sourceId: string, approved: boolean): void;
  submitPrompt(quality: M365PromptQuality): void;
  createDraft(kind: M365DraftKind): void;
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

  // Privacy contract: events contain only semantic action metadata and fixture IDs,
  // never prompt text, document bodies, meeting notes, e-mail text or person names.
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
          case "m365.activeApp":
            return state.activeApp;
          case "m365.approvedSourceCount":
            return state.approvedSourceIds.length;
          case "m365.prompt.submitted":
            return state.promptSubmitted;
          case "m365.prompt.qualityComplete":
            return promptQualityComplete(state.promptQuality);
          case "m365.draft.kind":
            return state.draftKind;
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

    selectApp(app) {
      replaceState({ ...state, activeApp: app }, "mutation");
      emit("m365.app.selected", { app });
    },

    setSourceApproved(sourceId, approved) {
      const sourceIds = new Set(state.approvedSourceIds);
      if (approved) sourceIds.add(sourceId);
      else sourceIds.delete(sourceId);
      replaceState({ ...state, approvedSourceIds: [...sourceIds].sort() }, "mutation");
      emit("m365.source.approval.changed", { sourceId, approved });
    },

    submitPrompt(quality) {
      replaceState(
        { ...state, promptSubmitted: true, promptQuality: { ...quality } },
        "mutation",
      );
      emit("m365.prompt.submitted", {
        qualityComplete: promptQualityComplete(quality),
        approvedSourceCount: state.approvedSourceIds.length,
      });
    },

    createDraft(kind) {
      replaceState({ ...state, draftKind: kind, approvalDecision: "pending" }, "mutation");
      emit("m365.draft.created", { kind });
    },

    markFactsChecked() {
      replaceState({ ...state, factsChecked: true }, "mutation");
      emit("m365.review.facts.checked", { checked: true });
    },

    rejectUnsupportedSuggestion() {
      replaceState({ ...state, unsupportedRejected: true }, "mutation");
      emit("m365.review.unsupported.rejected", { rejected: true });
    },

    decideApproval(decision) {
      replaceState({ ...state, approvalDecision: decision }, "mutation");
      emit("m365.approval.decided", { decision });
    },

    reset() {
      replaceState(initialState(), "reset");
    },
  };
}

export const m365CopilotRuntime = createM365CopilotRuntime();
