import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef } from "../types/training.ts";
import { COPILOT_RUNTIME_DEFINITION, getCopilotSurfaceTarget } from "./copilotDefinition.ts";
import {
  DEFAULT_COPILOT_PRODUCT_PROFILE,
  parseCopilotProductProfile,
  type CopilotChatModeId,
  type CopilotProductProfile,
} from "./copilotProductProfile.ts";

export type CopilotSuggestionStatus = "pending" | "accepted" | "rejected";

export interface CopilotChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface CopilotInlineSuggestion {
  id: string;
  file: string;
  text: string;
  status: CopilotSuggestionStatus;
}

interface CopilotInlineSuggestionTemplate {
  file: string;
  text: string;
  whenContentEquals?: string;
}

interface CopilotChatResponseTemplate {
  response: string;
  file?: string;
  promptContains?: string;
  promptContainsAny?: string[];
}

export interface CopilotRuntimeState {
  enabled: boolean;
  chatOpen: boolean;
  profileId: string;
  productVersion: string;
  mode: CopilotChatModeId;
  modelId: string;
  conversationId: string;
  messages: CopilotChatMessage[];
  contextActiveFile: string | null;
  inlineSuggestion: CopilotInlineSuggestion | null;
}

export type CopilotRuntimeStateChangeReason =
  "mount" | "reset" | "mutation" | "restore" | "profile";

type StateListener = (state: CopilotRuntimeState, reason: CopilotRuntimeStateChangeReason) => void;
type EventListener = (event: TrainingEvent) => void;

export interface CopilotRuntimeAdapter extends RuntimeAdapter {
  readonly hostProductId: "vscode";
  configureProductProfile(profile: unknown): void;
  getProductProfile(): CopilotProductProfile;
  subscribeState(handler: StateListener): () => void;
  setEnabled(enabled: boolean): void;
  setChatOpen(open: boolean): void;
  setContextActiveFile(filename: string | null): void;
  setMode(mode: CopilotChatModeId): void;
  setModel(modelId: string): void;
  startConversation(): string;
  submitPrompt(prompt: string, activeFileContent?: string | null): string;
  offerInlineSuggestion(file: string, text: string): CopilotInlineSuggestion;
  offerConfiguredInlineSuggestion(
    file: string,
    currentContent: string,
  ): CopilotInlineSuggestion | null;
  acceptInlineSuggestion(): string | null;
  rejectInlineSuggestion(): void;
  reset(): void;
}

let identifierSequence = 0;

function createIdentifier(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  identifierSequence += 1;
  return `${prefix}-${Date.now()}-${identifierSequence}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSuggestion(
  suggestion: CopilotInlineSuggestion | null,
): CopilotInlineSuggestion | null {
  return suggestion ? { ...suggestion } : null;
}

function cloneState(state: CopilotRuntimeState): CopilotRuntimeState {
  return {
    ...state,
    messages: state.messages.map((message) => ({ ...message })),
    inlineSuggestion: cloneSuggestion(state.inlineSuggestion),
  };
}

function initialState(profile: CopilotProductProfile): CopilotRuntimeState {
  return {
    enabled: true,
    chatOpen: false,
    profileId: profile.id,
    productVersion: profile.productVersion,
    mode: profile.defaultMode,
    modelId: profile.defaultModelId,
    conversationId: createIdentifier("copilot-conversation"),
    messages: [],
    contextActiveFile: null,
    inlineSuggestion: null,
  };
}

function hasOwn(seed: RuntimeSeed, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(seed, key);
}

function inlineSuggestionTemplatesFromSeed(seed?: RuntimeSeed): CopilotInlineSuggestionTemplate[] {
  if (!seed || !hasOwn(seed, "inlineSuggestions")) return [];
  const value = seed["inlineSuggestions"];
  if (!Array.isArray(value)) {
    throw new TypeError("Invalid Copilot runtime seed field: inlineSuggestions");
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new TypeError("Invalid Copilot inline suggestion seed");
    }
    const file = item["file"];
    const text = item["text"];
    const whenContentEquals = item["whenContentEquals"];
    if (
      typeof file !== "string" ||
      !file.trim() ||
      typeof text !== "string" ||
      !text ||
      (whenContentEquals !== undefined && typeof whenContentEquals !== "string")
    ) {
      throw new TypeError("Invalid Copilot inline suggestion seed");
    }
    return {
      file,
      text,
      ...(whenContentEquals === undefined ? {} : { whenContentEquals }),
    };
  });
}

function chatResponseTemplatesFromSeed(seed?: RuntimeSeed): CopilotChatResponseTemplate[] {
  if (!seed || !hasOwn(seed, "chatResponses")) return [];
  const value = seed["chatResponses"];
  if (!Array.isArray(value)) {
    throw new TypeError("Invalid Copilot runtime seed field: chatResponses");
  }

  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError("Invalid Copilot chat response seed");
    const response = item["response"];
    const file = item["file"];
    const promptContains = item["promptContains"];
    const promptContainsAny = item["promptContainsAny"];
    if (
      typeof response !== "string" ||
      !response ||
      (file !== undefined && (typeof file !== "string" || !file.trim())) ||
      (promptContains !== undefined &&
        (typeof promptContains !== "string" || !promptContains.trim())) ||
      (promptContainsAny !== undefined &&
        (!Array.isArray(promptContainsAny) ||
          promptContainsAny.length === 0 ||
          !promptContainsAny.every(
            (fragment) => typeof fragment === "string" && fragment.trim().length > 0,
          )))
    ) {
      throw new TypeError("Invalid Copilot chat response seed");
    }
    return {
      response,
      ...(file === undefined ? {} : { file }),
      ...(promptContains === undefined ? {} : { promptContains }),
      ...(promptContainsAny === undefined ? {} : { promptContainsAny }),
    };
  });
}

function describeActiveFile(activeFile: string, activeFileContent?: string | null): string {
  if (activeFileContent === undefined || activeFileContent === null) {
    return `Die aktuell geöffnete ${activeFile} ist als Dateikontext ausgewählt. Ihr Inhalt wurde dieser Anfrage jedoch nicht übergeben.`;
  }

  const nonEmptyLines = activeFileContent
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    return `Die aktuell geöffnete ${activeFile} ist derzeit leer.`;
  }

  const firstLine = nonEmptyLines[0]?.trim() ?? "";
  const isBarePythonFunction = /^def\s+[A-Za-z_]\w*\([^)]*\):$/.test(firstLine);
  if (isBarePythonFunction && nonEmptyLines.length === 1) {
    return `Die aktuell geöffnete ${activeFile} enthält die Funktionsdefinition \`${firstLine}\`, aber noch keinen Funktionskörper.`;
  }

  const preview = nonEmptyLines
    .slice(0, 2)
    .map((line) => `\`${line.trim()}\``)
    .join(" und ");
  const lineLabel = nonEmptyLines.length === 1 ? "nicht-leere Zeile" : "nicht-leere Zeilen";
  return `Die aktuell geöffnete ${activeFile} enthält ${nonEmptyLines.length} ${lineLabel}. Im aktuellen Inhalt sehe ich ${preview}.`;
}

function createAssistantResponse(
  prompt: string,
  activeFile: string | null,
  activeFileContent: string | null | undefined,
  responseTemplates: CopilotChatResponseTemplate[],
): string {
  const normalizedPrompt = prompt.toLowerCase();
  const configuredResponse = responseTemplates.find(
    (entry) =>
      (entry.file === undefined || entry.file === activeFile) &&
      (entry.promptContains === undefined ||
        normalizedPrompt.includes(entry.promptContains.toLowerCase())) &&
      (entry.promptContainsAny === undefined ||
        entry.promptContainsAny.some((fragment) =>
          normalizedPrompt.includes(fragment.toLowerCase()),
        )),
  );
  if (configuredResponse) return configuredResponse.response;

  const asksAboutFile =
    normalizedPrompt.includes("datei") ||
    normalizedPrompt.includes("kontext") ||
    normalizedPrompt.includes("was macht") ||
    normalizedPrompt.includes("erklär") ||
    normalizedPrompt.includes("erklaer");

  if (activeFile && asksAboutFile) {
    return describeActiveFile(activeFile, activeFileContent);
  }
  if (activeFile) {
    return `Ich berücksichtige ${activeFile} als aktiven Dateikontext. Formuliere konkret, was du zu dieser Datei verstehen oder ändern möchtest.`;
  }
  return "Aktuell ist keine Datei als Kontext geöffnet. Öffne eine relevante Datei, damit ich meine Antwort auf diesen Arbeitsstand beziehen kann.";
}

function messagesFromSeed(seed: RuntimeSeed): CopilotChatMessage[] {
  if (!hasOwn(seed, "messages")) return [];
  const value = seed["messages"];
  if (!Array.isArray(value)) {
    throw new TypeError("Invalid Copilot runtime seed field: messages");
  }

  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError("Invalid Copilot runtime seed message");
    const role = item["role"];
    const content = item["content"];
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      throw new TypeError("Invalid Copilot runtime seed message");
    }
    return {
      id: typeof item["id"] === "string" ? item["id"] : createIdentifier("copilot-message"),
      role,
      content,
    };
  });
}

function stateFromSeed(profile: CopilotProductProfile, seed?: RuntimeSeed): CopilotRuntimeState {
  const base = initialState(profile);
  if (!seed) return base;

  const enabled = hasOwn(seed, "enabled") ? seed["enabled"] : base.enabled;
  if (typeof enabled !== "boolean") {
    throw new TypeError("Invalid Copilot runtime seed field: enabled");
  }

  const chatOpen = hasOwn(seed, "chatOpen") ? seed["chatOpen"] : base.chatOpen;
  if (typeof chatOpen !== "boolean") {
    throw new TypeError("Invalid Copilot runtime seed field: chatOpen");
  }
  if (chatOpen && !enabled) {
    throw new TypeError("Copilot chat cannot be open while the runtime is disabled");
  }

  const mode = hasOwn(seed, "mode") ? seed["mode"] : base.mode;
  if (typeof mode !== "string" || !profile.chatModes.some((entry) => entry.id === mode)) {
    throw new TypeError(`Unsupported Copilot mode for profile ${profile.id}: ${String(mode)}`);
  }

  const modelId = hasOwn(seed, "modelId") ? seed["modelId"] : base.modelId;
  if (typeof modelId !== "string" || !profile.models.some((entry) => entry.id === modelId)) {
    throw new TypeError(`Unsupported Copilot model for profile ${profile.id}: ${String(modelId)}`);
  }

  const contextActiveFile = hasOwn(seed, "contextActiveFile")
    ? seed["contextActiveFile"]
    : base.contextActiveFile;
  if (contextActiveFile !== null && typeof contextActiveFile !== "string") {
    throw new TypeError("Invalid Copilot runtime seed field: contextActiveFile");
  }

  return {
    ...base,
    enabled,
    chatOpen,
    mode: mode as CopilotChatModeId,
    modelId,
    messages: messagesFromSeed(seed),
    contextActiveFile,
  };
}

function isRuntimeState(value: unknown): value is CopilotRuntimeState {
  if (!isRecord(value)) return false;

  const messages = value["messages"];
  const messagesValid =
    Array.isArray(messages) &&
    messages.every(
      (message) =>
        isRecord(message) &&
        typeof message["id"] === "string" &&
        (message["role"] === "user" || message["role"] === "assistant") &&
        typeof message["content"] === "string",
    );

  const suggestion = value["inlineSuggestion"];
  const suggestionValid =
    suggestion === null ||
    (isRecord(suggestion) &&
      typeof suggestion["id"] === "string" &&
      typeof suggestion["file"] === "string" &&
      typeof suggestion["text"] === "string" &&
      (suggestion["status"] === "pending" ||
        suggestion["status"] === "accepted" ||
        suggestion["status"] === "rejected"));

  return (
    typeof value["enabled"] === "boolean" &&
    typeof value["chatOpen"] === "boolean" &&
    (!value["chatOpen"] || value["enabled"]) &&
    typeof value["profileId"] === "string" &&
    typeof value["productVersion"] === "string" &&
    (value["mode"] === "ask" || value["mode"] === "plan" || value["mode"] === "agent") &&
    typeof value["modelId"] === "string" &&
    typeof value["conversationId"] === "string" &&
    messagesValid &&
    (value["contextActiveFile"] === null || typeof value["contextActiveFile"] === "string") &&
    suggestionValid
  );
}

export function createCopilotRuntime(
  initialProfile: CopilotProductProfile = DEFAULT_COPILOT_PRODUCT_PROFILE,
): CopilotRuntimeAdapter {
  let profile = parseCopilotProductProfile(initialProfile);
  let state = initialState(profile);
  let mountedInitialState: CopilotRuntimeState | null = null;
  let mountedContainer: ParentNode | null = null;
  let inlineSuggestionTemplates: CopilotInlineSuggestionTemplate[] = [];
  let chatResponseTemplates: CopilotChatResponseTemplate[] = [];
  let activeSessionId = createIdentifier("copilot-session");
  const eventListeners = new Set<EventListener>();
  const stateListeners = new Set<StateListener>();

  const notifyState = (reason: CopilotRuntimeStateChangeReason): void => {
    const snapshot = cloneState(state);
    for (const listener of stateListeners) listener(snapshot, reason);
  };

  const replaceState = (
    next: CopilotRuntimeState,
    reason: CopilotRuntimeStateChangeReason,
  ): void => {
    state = cloneState(next);
    notifyState(reason);
  };

  const emit = (type: string, payload: Record<string, unknown>): void => {
    const event: TrainingEvent = {
      id: createIdentifier("copilot-event"),
      source: COPILOT_RUNTIME_DEFINITION.id,
      type,
      timestamp: new Date().toISOString(),
      sessionId: activeSessionId,
      payload,
    };
    for (const listener of eventListeners) listener(event);
  };

  const adapter: CopilotRuntimeAdapter = {
    id: COPILOT_RUNTIME_DEFINITION.id,
    productId: COPILOT_RUNTIME_DEFINITION.productId,
    hostProductId: COPILOT_RUNTIME_DEFINITION.hostProductId,
    capabilities: ["chat", "inline_completion", "agent_mode"] as const,

    async mount(container: HTMLElement, seed?: RuntimeSeed): Promise<void> {
      mountedContainer = container;
      activeSessionId = createIdentifier("copilot-session");
      inlineSuggestionTemplates = inlineSuggestionTemplatesFromSeed(seed);
      chatResponseTemplates = chatResponseTemplatesFromSeed(seed);
      mountedInitialState = stateFromSeed(profile, seed);
      replaceState(mountedInitialState, "mount");
    },

    async unmount(): Promise<void> {
      mountedContainer = null;
      mountedInitialState = null;
      inlineSuggestionTemplates = [];
      chatResponseTemplates = [];
    },

    subscribe(handler: EventListener): () => void {
      eventListeners.add(handler);
      return () => eventListeners.delete(handler);
    },

    subscribeState(handler: StateListener): () => void {
      stateListeners.add(handler);
      return () => stateListeners.delete(handler);
    },

    configureProductProfile(value: unknown): void {
      if (mountedContainer) {
        throw new Error("Copilot product profile cannot change while mounted");
      }
      profile = parseCopilotProductProfile(value);
      replaceState(initialState(profile), "profile");
    },

    getProductProfile(): CopilotProductProfile {
      return parseCopilotProductProfile(profile);
    },

    describeSurface(): RuntimeSurfaceDescription[] {
      return COPILOT_RUNTIME_DEFINITION.surface.map((entry) => ({ ...entry }));
    },

    resolveTarget(ref: UiTargetRef): DOMRect | null {
      if (!getCopilotSurfaceTarget(ref) || !mountedContainer) return null;
      const element = mountedContainer.querySelector<HTMLElement>(`[data-highlight="${ref}"]`);
      return element?.getBoundingClientRect() ?? null;
    },

    setEnabled(enabled: boolean): void {
      if (state.enabled === enabled) return;
      replaceState({ ...state, enabled, chatOpen: enabled ? state.chatOpen : false }, "mutation");
      emit("copilot.enabled.changed", { enabled });
    },

    setChatOpen(open: boolean): void {
      if (open && !state.enabled) {
        throw new Error("Copilot runtime is disabled");
      }
      if (state.chatOpen === open) return;
      replaceState({ ...state, chatOpen: open }, "mutation");
      if (open) {
        emit("copilot.chat.opened", {
          conversationId: state.conversationId,
          activeFile: state.contextActiveFile,
          mode: state.mode,
          modelId: state.modelId,
        });
      }
    },

    setContextActiveFile(filename: string | null): void {
      if (state.contextActiveFile === filename) return;
      replaceState({ ...state, contextActiveFile: filename }, "mutation");
      emit("copilot.context.changed", { activeFile: filename });
    },

    setMode(mode: CopilotChatModeId): void {
      if (!profile.chatModes.some((entry) => entry.id === mode)) {
        throw new RangeError(`Unsupported Copilot mode for profile ${profile.id}: ${mode}`);
      }
      if (state.mode === mode) return;
      replaceState({ ...state, mode }, "mutation");
      emit("copilot.mode.changed", { mode });
    },

    setModel(modelId: string): void {
      if (!profile.models.some((entry) => entry.id === modelId)) {
        throw new RangeError(`Unsupported Copilot model for profile ${profile.id}: ${modelId}`);
      }
      if (state.modelId === modelId) return;
      replaceState({ ...state, modelId }, "mutation");
      emit("copilot.model.changed", { modelId });
    },

    startConversation(): string {
      const conversationId = createIdentifier("copilot-conversation");
      replaceState({ ...state, conversationId, messages: [], inlineSuggestion: null }, "mutation");
      emit("copilot.conversation.started", {
        conversationId,
        activeFile: state.contextActiveFile,
        mode: state.mode,
        modelId: state.modelId,
      });
      return conversationId;
    },

    submitPrompt(rawPrompt: string, activeFileContent?: string | null): string {
      const prompt = rawPrompt.trim();
      if (!prompt) throw new TypeError("Copilot prompt must not be empty");
      if (!state.enabled) throw new Error("Copilot runtime is disabled");

      const userMessage: CopilotChatMessage = {
        id: createIdentifier("copilot-message"),
        role: "user",
        content: prompt,
      };
      const responseText = createAssistantResponse(
        prompt,
        state.contextActiveFile,
        activeFileContent,
        chatResponseTemplates,
      );
      const assistantMessage: CopilotChatMessage = {
        id: createIdentifier("copilot-message"),
        role: "assistant",
        content: responseText,
      };
      replaceState(
        { ...state, messages: [...state.messages, userMessage, assistantMessage] },
        "mutation",
      );
      emit("copilot.prompt.submitted", {
        prompt,
        activeFile: state.contextActiveFile,
        conversationId: state.conversationId,
        mode: state.mode,
        modelId: state.modelId,
      });
      return responseText;
    },

    offerInlineSuggestion(file: string, text: string): CopilotInlineSuggestion {
      if (!state.enabled) throw new Error("Copilot runtime is disabled");
      if (!file.trim() || !text) {
        throw new TypeError("Inline suggestion requires file and text");
      }
      const suggestion: CopilotInlineSuggestion = {
        id: createIdentifier("copilot-suggestion"),
        file,
        text,
        status: "pending",
      };
      replaceState({ ...state, inlineSuggestion: suggestion }, "mutation");
      emit("ai.suggestion.shown", { suggestionId: suggestion.id, file, text });
      return { ...suggestion };
    },

    offerConfiguredInlineSuggestion(
      file: string,
      currentContent: string,
    ): CopilotInlineSuggestion | null {
      const template = inlineSuggestionTemplates.find(
        (entry) =>
          entry.file === file &&
          (entry.whenContentEquals === undefined || entry.whenContentEquals === currentContent),
      );
      if (!template) return null;
      return adapter.offerInlineSuggestion(file, template.text);
    },

    acceptInlineSuggestion(): string | null {
      const suggestion = state.inlineSuggestion;
      if (!suggestion || suggestion.status !== "pending") return null;
      const accepted = { ...suggestion, status: "accepted" as const };
      replaceState({ ...state, inlineSuggestion: accepted }, "mutation");
      emit("ai.suggestion.accepted", {
        suggestionId: accepted.id,
        file: accepted.file,
        text: accepted.text,
      });
      return accepted.text;
    },

    rejectInlineSuggestion(): void {
      const suggestion = state.inlineSuggestion;
      if (!suggestion || suggestion.status !== "pending") return;
      const rejected = { ...suggestion, status: "rejected" as const };
      replaceState({ ...state, inlineSuggestion: rejected }, "mutation");
      emit("ai.suggestion.rejected", {
        suggestionId: rejected.id,
        file: rejected.file,
      });
    },

    async query<T = unknown>(selector: string): Promise<T> {
      let value: unknown;
      switch (selector) {
        case "copilot.enabled":
          value = state.enabled;
          break;
        case "copilot.chat.open":
          value = state.chatOpen;
          break;
        case "copilot.profile.id":
          value = state.profileId;
          break;
        case "copilot.product.version":
          value = state.productVersion;
          break;
        case "copilot.conversation.id":
          value = state.conversationId;
          break;
        case "copilot.conversation.messageCount":
          value = state.messages.length;
          break;
        case "copilot.mode":
          value = state.mode;
          break;
        case "copilot.model":
          value = state.modelId;
          break;
        case "copilot.context.activeFile":
          value = state.contextActiveFile;
          break;
        case "copilot.inline.status":
          value = state.inlineSuggestion?.status ?? null;
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
        throw new TypeError("Invalid Copilot runtime snapshot");
      }
      if (snapshot.profileId !== profile.id || snapshot.productVersion !== profile.productVersion) {
        throw new TypeError(
          "Copilot runtime snapshot does not match the configured product profile",
        );
      }
      if (!profile.chatModes.some((entry) => entry.id === snapshot.mode)) {
        throw new TypeError("Copilot runtime snapshot contains an unavailable mode");
      }
      if (!profile.models.some((entry) => entry.id === snapshot.modelId)) {
        throw new TypeError("Copilot runtime snapshot contains an unavailable model");
      }
      replaceState(snapshot, "restore");
    },

    reset(): void {
      replaceState(mountedInitialState ?? initialState(profile), "reset");
    },
  };

  return adapter;
}

export const copilotRuntime = createCopilotRuntime();
