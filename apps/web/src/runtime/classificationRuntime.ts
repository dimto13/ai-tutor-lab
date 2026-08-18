import {
  isAiToolAllowed,
  parseClassificationScheme,
  syntheticDocumentSchema,
  type ClassificationScheme,
  type SyntheticDocument,
} from "@ai-train-lab/catalog";
import type { TrainingEvent, UiTargetRef } from "../types/training.ts";
import {
  CLASSIFICATION_RUNTIME_DEFINITION,
  getClassificationTarget,
} from "./classificationDefinition.ts";
import type {
  RuntimeAdapter,
  RuntimeSeed,
  RuntimeStateChange,
  RuntimeSurfaceDescription,
} from "./runtimeAdapter.ts";

export interface ClassificationDocumentProgress {
  markedIndicatorIds: string[];
  selectedLevelId: string | null;
  aiTool: string | null;
  aiDecisions: Record<string, boolean>;
}

export interface ClassificationSimulatorState {
  scheme: ClassificationScheme | null;
  documents: SyntheticDocument[];
  activeDocumentId: string | null;
  viewedDocumentIds: string[];
  markedIndicatorIds: string[];
  selectedLevelId: string | null;
  aiTool: string | null;
  aiDecisions: Record<string, boolean>;
  documentProgress: Record<string, ClassificationDocumentProgress>;
}

export type ClassificationStateChangeReason = "mount" | "reset" | "mutation" | "restore";
type StateListener = (
  state: ClassificationSimulatorState,
  reason: ClassificationStateChangeReason,
) => void;
type EventListener = (event: TrainingEvent) => void;

export interface ClassificationRuntimeAdapter extends RuntimeAdapter {
  subscribeState(handler: StateListener): () => void;
  inspect(ref: UiTargetRef): void;
  viewDocument(documentId: string): void;
  markIndicator(indicatorId: string, marked?: boolean): void;
  selectLevel(levelId: string): void;
  selectAiTool(tool: string): void;
  setAiDecision(tool: string, allowed: boolean): void;
  reset(): void;
}

let identifierSequence = 0;

function createIdentifier(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  identifierSequence += 1;
  return `${prefix}-${Date.now()}-${identifierSequence}`;
}

function emptyDocumentProgress(aiTool: string | null = null): ClassificationDocumentProgress {
  return {
    markedIndicatorIds: [],
    selectedLevelId: null,
    aiTool,
    aiDecisions: {},
  };
}

function emptyState(): ClassificationSimulatorState {
  return {
    scheme: null,
    documents: [],
    activeDocumentId: null,
    viewedDocumentIds: [],
    markedIndicatorIds: [],
    selectedLevelId: null,
    aiTool: null,
    aiDecisions: {},
    documentProgress: {},
  };
}

function cloneState(state: ClassificationSimulatorState): ClassificationSimulatorState {
  return structuredClone(state);
}

function currentProgress(state: ClassificationSimulatorState): ClassificationDocumentProgress {
  return {
    markedIndicatorIds: [...state.markedIndicatorIds],
    selectedLevelId: state.selectedLevelId,
    aiTool: state.aiTool,
    aiDecisions: { ...state.aiDecisions },
  };
}

function withActiveProgress(
  state: ClassificationSimulatorState,
  patch: Partial<ClassificationDocumentProgress>,
): ClassificationSimulatorState {
  const progress = { ...currentProgress(state), ...patch };
  const activeDocumentId = state.activeDocumentId;
  return {
    ...state,
    markedIndicatorIds: [...progress.markedIndicatorIds],
    selectedLevelId: progress.selectedLevelId,
    aiTool: progress.aiTool,
    aiDecisions: { ...progress.aiDecisions },
    documentProgress: activeDocumentId
      ? {
          ...state.documentProgress,
          [activeDocumentId]: {
            ...progress,
            markedIndicatorIds: [...progress.markedIndicatorIds],
            aiDecisions: { ...progress.aiDecisions },
          },
        }
      : state.documentProgress,
  };
}

function seedConfiguration(seed?: RuntimeSeed): Record<string, unknown> | null {
  const value = seed?.["classificationSimulator"];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function initialState(seed?: RuntimeSeed): ClassificationSimulatorState {
  const configuration = seedConfiguration(seed);
  if (!configuration) return emptyState();

  const scheme = parseClassificationScheme(configuration["scheme"]);
  const documents = syntheticDocumentSchema.array().min(1).parse(configuration["documents"]);
  const requestedDocumentId = configuration["activeDocumentId"];
  const activeDocumentId =
    typeof requestedDocumentId === "string" &&
    documents.some((document) => document.id === requestedDocumentId)
      ? requestedDocumentId
      : (documents[0]?.id ?? null);
  const requestedAiTool = configuration["aiTool"];
  const aiTool =
    typeof requestedAiTool === "string" &&
    scheme.aiPolicy.some((policy) => policy.tool === requestedAiTool)
      ? requestedAiTool
      : (scheme.aiPolicy[0]?.tool ?? null);

  return {
    scheme,
    documents: structuredClone(documents),
    activeDocumentId,
    viewedDocumentIds: [],
    markedIndicatorIds: [],
    selectedLevelId: null,
    aiTool,
    aiDecisions: {},
    documentProgress: {},
  };
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError(`Invalid classification snapshot ${label}`);
  }
  return [...value];
}

function parseBooleanRecord(value: unknown, label = "aiDecisions"): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Invalid classification snapshot ${label}`);
  }
  const entries = Object.entries(value);
  if (!entries.every(([, decision]) => typeof decision === "boolean")) {
    throw new TypeError(`Invalid classification snapshot ${label}`);
  }
  return Object.fromEntries(entries) as Record<string, boolean>;
}

function validateDocumentProgress(
  progress: ClassificationDocumentProgress,
  scheme: ClassificationScheme | null,
  label: string,
): void {
  if (!progress.markedIndicatorIds.every((id) => scheme?.indicators.some((entry) => entry.id === id))) {
    throw new TypeError(`Invalid classification snapshot ${label}.markedIndicatorIds`);
  }
  if (
    progress.selectedLevelId !== null &&
    !scheme?.levels.some((level) => level.id === progress.selectedLevelId)
  ) {
    throw new TypeError(`Invalid classification snapshot ${label}.selectedLevelId`);
  }
  if (progress.aiTool !== null && !scheme?.aiPolicy.some((policy) => policy.tool === progress.aiTool)) {
    throw new TypeError(`Invalid classification snapshot ${label}.aiTool`);
  }
  if (
    !Object.keys(progress.aiDecisions).every((tool) =>
      scheme?.aiPolicy.some((policy) => policy.tool === tool),
    )
  ) {
    throw new TypeError(`Invalid classification snapshot ${label}.aiDecisions`);
  }
}

function parseDocumentProgressRecord(
  value: unknown,
  documents: SyntheticDocument[],
  scheme: ClassificationScheme | null,
): Record<string, ClassificationDocumentProgress> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid classification snapshot documentProgress");
  }
  const result: Record<string, ClassificationDocumentProgress> = {};
  for (const [documentId, rawProgress] of Object.entries(value)) {
    if (!documents.some((document) => document.id === documentId)) {
      throw new TypeError(`Invalid classification snapshot documentProgress.${documentId}`);
    }
    if (!rawProgress || typeof rawProgress !== "object" || Array.isArray(rawProgress)) {
      throw new TypeError(`Invalid classification snapshot documentProgress.${documentId}`);
    }
    const candidate = rawProgress as Record<string, unknown>;
    const markedIndicatorIds = parseStringArray(
      candidate["markedIndicatorIds"],
      `documentProgress.${documentId}.markedIndicatorIds`,
    );
    const selectedLevelId = candidate["selectedLevelId"];
    const aiTool = candidate["aiTool"];
    if (selectedLevelId !== null && typeof selectedLevelId !== "string") {
      throw new TypeError(`Invalid classification snapshot documentProgress.${documentId}.selectedLevelId`);
    }
    if (aiTool !== null && typeof aiTool !== "string") {
      throw new TypeError(`Invalid classification snapshot documentProgress.${documentId}.aiTool`);
    }
    const progress: ClassificationDocumentProgress = {
      markedIndicatorIds,
      selectedLevelId: selectedLevelId as string | null,
      aiTool: aiTool as string | null,
      aiDecisions: parseBooleanRecord(
        candidate["aiDecisions"],
        `documentProgress.${documentId}.aiDecisions`,
      ),
    };
    validateDocumentProgress(progress, scheme, `documentProgress.${documentId}`);
    result[documentId] = progress;
  }
  return result;
}

function parseRuntimeState(value: unknown): ClassificationSimulatorState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid classification snapshot");
  }
  const candidate = value as Record<string, unknown>;
  const scheme =
    candidate["scheme"] === null ? null : parseClassificationScheme(candidate["scheme"]);
  const documents = syntheticDocumentSchema.array().parse(candidate["documents"]);
  const activeDocumentId = candidate["activeDocumentId"];
  if (
    activeDocumentId !== null &&
    (typeof activeDocumentId !== "string" ||
      !documents.some((document) => document.id === activeDocumentId))
  ) {
    throw new TypeError("Invalid classification snapshot activeDocumentId");
  }
  const selectedLevelId = candidate["selectedLevelId"];
  if (
    selectedLevelId !== null &&
    (typeof selectedLevelId !== "string" ||
      !scheme?.levels.some((level) => level.id === selectedLevelId))
  ) {
    throw new TypeError("Invalid classification snapshot selectedLevelId");
  }
  const aiTool = candidate["aiTool"];
  if (
    aiTool !== null &&
    (typeof aiTool !== "string" || !scheme?.aiPolicy.some((policy) => policy.tool === aiTool))
  ) {
    throw new TypeError("Invalid classification snapshot aiTool");
  }

  const viewedDocumentIds = parseStringArray(candidate["viewedDocumentIds"], "viewedDocumentIds");
  if (!viewedDocumentIds.every((id) => documents.some((document) => document.id === id))) {
    throw new TypeError("Invalid classification snapshot viewedDocumentIds");
  }
  const markedIndicatorIds = parseStringArray(
    candidate["markedIndicatorIds"],
    "markedIndicatorIds",
  );
  const activeProgress: ClassificationDocumentProgress = {
    markedIndicatorIds,
    selectedLevelId: selectedLevelId as string | null,
    aiTool: aiTool as string | null,
    aiDecisions: parseBooleanRecord(candidate["aiDecisions"]),
  };
  validateDocumentProgress(activeProgress, scheme, "activeProgress");

  const documentProgress = parseDocumentProgressRecord(
    candidate["documentProgress"],
    documents,
    scheme,
  );
  if (activeDocumentId && candidate["documentProgress"] === undefined) {
    documentProgress[activeDocumentId as string] = activeProgress;
  }

  return {
    scheme,
    documents: structuredClone(documents),
    activeDocumentId: activeDocumentId as string | null,
    viewedDocumentIds,
    markedIndicatorIds,
    selectedLevelId: selectedLevelId as string | null,
    aiTool: aiTool as string | null,
    aiDecisions: { ...activeProgress.aiDecisions },
    documentProgress,
  };
}

export function createClassificationRuntime(): ClassificationRuntimeAdapter {
  let state = emptyState();
  let mountedInitialState: ClassificationSimulatorState | null = null;
  let mountedContainer: ParentNode | null = null;
  let activeSessionId = createIdentifier("classification-session");
  const eventListeners = new Set<EventListener>();
  const stateListeners = new Set<StateListener>();
  const genericStateListeners = new Set<(change: RuntimeStateChange) => void>();

  const replaceState = (
    nextState: ClassificationSimulatorState,
    reason: ClassificationStateChangeReason,
  ): void => {
    state = cloneState(nextState);
    const snapshot = cloneState(state);
    for (const listener of stateListeners) listener(snapshot, reason);
    for (const listener of genericStateListeners) listener({ reason });
  };

  const emit = (type: string, payload: Record<string, unknown>): void => {
    const event: TrainingEvent = {
      id: createIdentifier("classification-event"),
      source: CLASSIFICATION_RUNTIME_DEFINITION.id,
      type,
      timestamp: new Date().toISOString(),
      sessionId: activeSessionId,
      payload,
    };
    for (const listener of eventListeners) listener(event);
  };

  const currentDocument = (): SyntheticDocument | null =>
    state.documents.find((document) => document.id === state.activeDocumentId) ?? null;

  const requireScheme = (): ClassificationScheme => {
    if (!state.scheme) throw new Error("Classification runtime has no configured scheme");
    return state.scheme;
  };

  return {
    id: CLASSIFICATION_RUNTIME_DEFINITION.id,
    productId: CLASSIFICATION_RUNTIME_DEFINITION.productId,
    capabilities: ["artifact_preview"] as const,

    async mount(container, seed) {
      const nextInitialState = initialState(seed);
      mountedContainer = container;
      activeSessionId = createIdentifier("classification-session");
      mountedInitialState = nextInitialState;
      replaceState(nextInitialState, "mount");
    },

    async unmount() {
      mountedContainer = null;
      mountedInitialState = null;
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
      genericStateListeners.add(handler);
      return () => genericStateListeners.delete(handler);
    },

    query<T = unknown>(selector: string): Promise<T> {
      const document = currentDocument();
      const selectedAiDecision = state.aiTool ? (state.aiDecisions[state.aiTool] ?? null) : null;
      const policyAllowed =
        state.scheme && state.aiTool && state.selectedLevelId
          ? isAiToolAllowed(state.scheme, state.aiTool, state.selectedLevelId)
          : null;
      const values: Record<string, unknown> = {
        "classification.document.id": state.activeDocumentId,
        "classification.document.current": document ? structuredClone(document) : null,
        "classification.document.viewedIds": [...state.viewedDocumentIds],
        "classification.indicators.marked": [...state.markedIndicatorIds],
        "classification.level.selected": state.selectedLevelId,
        "classification.ai.tool": state.aiTool,
        "classification.ai.decision": selectedAiDecision,
        "classification.ai.decisions": { ...state.aiDecisions },
        "classification.ai.policyAllowed": policyAllowed,
        "classification.documents.progress": structuredClone(state.documentProgress),
        "classification.validation.state": {
          viewedDocumentIds: [...state.viewedDocumentIds],
          scheme: state.scheme
            ? {
                levels: state.scheme.levels.map(({ id, label, rank }) => ({ id, label, rank })),
                indicators: state.scheme.indicators.map(({ id, label }) => ({ id, label })),
              }
            : null,
          documentProgress: structuredClone(state.documentProgress),
        },
      };
      return Promise.resolve(values[selector] as T);
    },

    resolveTarget(ref) {
      if (!mountedContainer || !getClassificationTarget(ref)) return null;
      return (
        mountedContainer
          .querySelector<HTMLElement>(`[data-highlight="${ref}"]`)
          ?.getBoundingClientRect() ?? null
      );
    },

    describeSurface(): RuntimeSurfaceDescription[] {
      return CLASSIFICATION_RUNTIME_DEFINITION.surface.map((entry) => ({ ...entry }));
    },

    snapshot() {
      return Promise.resolve(cloneState(state));
    },

    async restore(snapshot) {
      replaceState(parseRuntimeState(snapshot), "restore");
    },

    inspect(ref) {
      const target = getClassificationTarget(ref);
      if (!target) return;
      emit("ui.element.inspected", {
        ref,
        label: target.label,
        conceptKey: target.conceptKey,
      });
    },

    viewDocument(documentId) {
      const document = state.documents.find((candidate) => candidate.id === documentId);
      if (!document) throw new Error(`Unknown synthetic document: ${documentId}`);
      const viewedDocumentIds = state.viewedDocumentIds.includes(documentId)
        ? state.viewedDocumentIds
        : [...state.viewedDocumentIds, documentId];
      const documentProgress = { ...state.documentProgress };
      if (state.activeDocumentId) {
        documentProgress[state.activeDocumentId] = currentProgress(state);
      }
      const targetProgress =
        documentId === state.activeDocumentId
          ? currentProgress(state)
          : (documentProgress[documentId] ?? emptyDocumentProgress(state.scheme?.aiPolicy[0]?.tool ?? null));
      documentProgress[documentId] = targetProgress;
      replaceState(
        {
          ...state,
          activeDocumentId: documentId,
          viewedDocumentIds,
          markedIndicatorIds: [...targetProgress.markedIndicatorIds],
          selectedLevelId: targetProgress.selectedLevelId,
          aiTool: targetProgress.aiTool,
          aiDecisions: { ...targetProgress.aiDecisions },
          documentProgress,
        },
        "mutation",
      );
      emit("document.viewed", {
        documentId: document.id,
        documentType: document.documentType,
      });
    },

    markIndicator(indicatorId, marked = true) {
      const scheme = requireScheme();
      if (!scheme.indicators.some((indicator) => indicator.id === indicatorId)) {
        throw new Error(`Unknown classification indicator: ${indicatorId}`);
      }
      const markedIndicatorIds = marked
        ? [...new Set([...state.markedIndicatorIds, indicatorId])]
        : state.markedIndicatorIds.filter((id) => id !== indicatorId);
      replaceState(withActiveProgress(state, { markedIndicatorIds }), "mutation");
      emit("indicator.marked", {
        documentId: state.activeDocumentId,
        indicatorId,
        marked,
      });
    },

    selectLevel(levelId) {
      const scheme = requireScheme();
      if (!scheme.levels.some((level) => level.id === levelId)) {
        throw new Error(`Unknown classification level: ${levelId}`);
      }
      replaceState(withActiveProgress(state, { selectedLevelId: levelId }), "mutation");
      emit("level.selected", {
        documentId: state.activeDocumentId,
        levelId,
      });
    },

    selectAiTool(tool) {
      const scheme = requireScheme();
      if (!scheme.aiPolicy.some((policy) => policy.tool === tool)) {
        throw new Error(`Unknown AI tool policy: ${tool}`);
      }
      replaceState(withActiveProgress(state, { aiTool: tool }), "mutation");
    },

    setAiDecision(tool, allowed) {
      const scheme = requireScheme();
      if (!scheme.aiPolicy.some((policy) => policy.tool === tool)) {
        throw new Error(`Unknown AI tool policy: ${tool}`);
      }
      replaceState(
        withActiveProgress(state, {
          aiTool: tool,
          aiDecisions: { ...state.aiDecisions, [tool]: allowed },
        }),
        "mutation",
      );
      emit("ai.use.decided", {
        documentId: state.activeDocumentId,
        tool,
        allowed,
      });
    },

    reset() {
      replaceState(mountedInitialState ?? emptyState(), "reset");
    },
  };
}

export const classificationRuntime = createClassificationRuntime();
