import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef } from "../types/training.ts";
import {
  artifactPreviewSeedSchema,
  parseArtifactPreviewSeed,
  previewArtifactSchema,
  type ArtifactPreviewViewMode,
  type ArtifactRevision,
  type PreviewArtifact,
} from "./artifactPreviewContent.ts";
import {
  ARTIFACT_PREVIEW_DEFINITION,
  getArtifactPreviewTarget,
} from "./artifactPreviewDefinition.ts";

export interface ArtifactPreviewState {
  artifacts: PreviewArtifact[];
  activeArtifactId: string | null;
  viewMode: ArtifactPreviewViewMode;
  revisions: ArtifactRevision[];
  appliedRevisionIds: string[];
  verifiedIds: string[];
}

export type ArtifactPreviewStateChangeReason = "mount" | "reset" | "mutation" | "restore";
type StateListener = (
  state: ArtifactPreviewState,
  reason: ArtifactPreviewStateChangeReason,
) => void;
type EventListener = (event: TrainingEvent) => void;

export interface ArtifactPreviewRuntimeAdapter extends RuntimeAdapter {
  readonly hostProductId: "vscode";
  subscribeState(handler: StateListener): () => void;
  inspect(ref: UiTargetRef): void;
  createArtifact(artifact: PreviewArtifact): void;
  selectArtifact(artifactId: string): void;
  setViewMode(viewMode: ArtifactPreviewViewMode): void;
  applyRevision(revisionId: string): void;
  verifyActiveArtifact(): void;
  reset(): void;
}

let identifierSequence = 0;

function createIdentifier(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  identifierSequence += 1;
  return `${prefix}-${Date.now()}-${identifierSequence}`;
}

function cloneArtifact(artifact: PreviewArtifact): PreviewArtifact {
  if (artifact.type === "html") return { ...artifact };
  if (artifact.type === "data") {
    return { ...artifact, value: structuredClone(artifact.value) };
  }
  return {
    ...artifact,
    columns: artifact.columns.map((column) => ({ ...column })),
    rows: artifact.rows.map((row) => ({ ...row })),
    ...(artifact.formulas ? { formulas: { ...artifact.formulas } } : {}),
  };
}

function cloneRevision(revision: ArtifactRevision): ArtifactRevision {
  return { ...revision, next: cloneArtifact(revision.next) };
}

function cloneState(state: ArtifactPreviewState): ArtifactPreviewState {
  return {
    ...state,
    artifacts: state.artifacts.map(cloneArtifact),
    revisions: state.revisions.map(cloneRevision),
    appliedRevisionIds: [...state.appliedRevisionIds],
    verifiedIds: [...state.verifiedIds],
  };
}

function initialState(seed?: RuntimeSeed): ArtifactPreviewState {
  const parsed = parseArtifactPreviewSeed(seed);
  if (!parsed) {
    return {
      artifacts: [],
      activeArtifactId: null,
      viewMode: "preview",
      revisions: [],
      appliedRevisionIds: [],
      verifiedIds: [],
    };
  }
  return {
    artifacts: parsed.artifacts.map(cloneArtifact),
    activeArtifactId: parsed.activeArtifactId,
    viewMode: parsed.viewMode,
    revisions: parsed.revisions.map(cloneRevision),
    appliedRevisionIds: [],
    verifiedIds: [],
  };
}

function isRuntimeState(value: unknown): value is ArtifactPreviewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<ArtifactPreviewState>;
  const stringArray = (candidate: unknown): candidate is string[] =>
    Array.isArray(candidate) && candidate.every((id) => typeof id === "string");
  if (Array.isArray(state.artifacts) && state.artifacts.length === 0) {
    return (
      state.activeArtifactId === null &&
      (state.viewMode === "preview" || state.viewMode === "source") &&
      Array.isArray(state.revisions) &&
      state.revisions.length === 0 &&
      stringArray(state.appliedRevisionIds) &&
      stringArray(state.verifiedIds)
    );
  }
  const seedResult = artifactPreviewSeedSchema.safeParse({
    artifacts: state.artifacts,
    revisions: state.revisions,
    activeArtifactId: state.activeArtifactId ?? undefined,
    viewMode: state.viewMode,
  });
  return (
    seedResult.success &&
    (state.activeArtifactId === null || typeof state.activeArtifactId === "string") &&
    stringArray(state.appliedRevisionIds) &&
    stringArray(state.verifiedIds)
  );
}

export function createArtifactPreviewRuntime(): ArtifactPreviewRuntimeAdapter {
  let state = initialState();
  let mountedInitialState: ArtifactPreviewState | null = null;
  let mountedContainer: ParentNode | null = null;
  let activeSessionId = createIdentifier("artifact-session");
  const eventListeners = new Set<EventListener>();
  const stateListeners = new Set<StateListener>();

  const replaceState = (
    nextState: ArtifactPreviewState,
    reason: ArtifactPreviewStateChangeReason,
  ): void => {
    state = cloneState(nextState);
    const snapshot = cloneState(state);
    for (const listener of stateListeners) listener(snapshot, reason);
  };

  const emit = (type: string, payload: Record<string, unknown>): void => {
    const event: TrainingEvent = {
      id: createIdentifier("artifact-event"),
      source: ARTIFACT_PREVIEW_DEFINITION.id,
      type,
      timestamp: new Date().toISOString(),
      sessionId: activeSessionId,
      payload,
    };
    for (const listener of eventListeners) listener(event);
  };

  const activeArtifact = (): PreviewArtifact | null =>
    state.artifacts.find((artifact) => artifact.id === state.activeArtifactId) ?? null;

  return {
    id: ARTIFACT_PREVIEW_DEFINITION.id,
    productId: ARTIFACT_PREVIEW_DEFINITION.productId,
    hostProductId: ARTIFACT_PREVIEW_DEFINITION.hostProductId,
    capabilities: ["artifact_preview"] as const,

    async mount(container, seed) {
      const nextInitialState = initialState(seed);
      mountedContainer = container;
      activeSessionId = createIdentifier("artifact-session");
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

    query<T = unknown>(selector: string): Promise<T> {
      const current = activeArtifact();
      const currentRevision = [...state.appliedRevisionIds]
        .reverse()
        .map((id) => state.revisions.find((revision) => revision.id === id))
        .find((revision) => revision?.artifactId === current?.id)?.id;
      const values: Record<string, unknown> = {
        "artifact.active.id": state.activeArtifactId,
        "artifact.active.type": current?.type ?? null,
        "artifact.viewMode": state.viewMode,
        "artifact.items": state.artifacts.map((artifact) => artifact.id),
        "artifact.current": current ? cloneArtifact(current) : null,
        "artifact.current.revision": currentRevision ?? null,
        "artifact.appliedRevisionIds": [...state.appliedRevisionIds],
        "artifact.verified": current ? state.verifiedIds.includes(current.id) : false,
        "artifact.verifiedIds": [...state.verifiedIds],
      };
      return Promise.resolve(values[selector] as T);
    },

    resolveTarget(ref) {
      if (!mountedContainer || !getArtifactPreviewTarget(ref)) return null;
      return (
        mountedContainer
          .querySelector<HTMLElement>(`[data-highlight="${ref}"]`)
          ?.getBoundingClientRect() ?? null
      );
    },

    describeSurface(): RuntimeSurfaceDescription[] {
      return ARTIFACT_PREVIEW_DEFINITION.surface.map((entry) => ({ ...entry }));
    },

    snapshot() {
      return Promise.resolve(cloneState(state));
    },

    async restore(snapshot) {
      if (!isRuntimeState(snapshot)) throw new TypeError("Invalid artifact preview snapshot");
      replaceState(snapshot, "restore");
    },

    inspect(ref) {
      const target = getArtifactPreviewTarget(ref);
      if (!target) return;
      emit("ui.element.inspected", {
        ref,
        label: target.label,
        conceptKey: target.conceptKey,
      });
    },

    createArtifact(value) {
      const artifact = previewArtifactSchema.parse(value);
      const nextArtifacts = [
        ...state.artifacts.filter((candidate) => candidate.id !== artifact.id),
        cloneArtifact(artifact),
      ];
      replaceState(
        {
          ...state,
          artifacts: nextArtifacts,
          activeArtifactId: artifact.id,
          verifiedIds: state.verifiedIds.filter((id) => id !== artifact.id),
        },
        "mutation",
      );
      emit("artifact.created", { artifactId: artifact.id, artifactType: artifact.type });
    },

    selectArtifact(artifactId) {
      const artifact = state.artifacts.find((candidate) => candidate.id === artifactId);
      if (!artifact) return;
      replaceState({ ...state, activeArtifactId: artifactId }, "mutation");
      emit("artifact.selected", { artifactId, artifactType: artifact.type });
    },

    setViewMode(viewMode) {
      if (state.viewMode === viewMode) return;
      replaceState({ ...state, viewMode }, "mutation");
      emit("artifact.viewSwitched", { viewMode, artifactId: state.activeArtifactId });
    },

    applyRevision(revisionId) {
      const revision = state.revisions.find((candidate) => candidate.id === revisionId);
      if (!revision || state.appliedRevisionIds.includes(revisionId)) return;
      const artifacts = state.artifacts.map((artifact) =>
        artifact.id === revision.artifactId ? cloneArtifact(revision.next) : artifact,
      );
      replaceState(
        {
          ...state,
          artifacts,
          activeArtifactId: revision.artifactId,
          appliedRevisionIds: [...state.appliedRevisionIds, revisionId],
          verifiedIds: state.verifiedIds.filter((id) => id !== revision.artifactId),
        },
        "mutation",
      );
      emit("artifact.updated", {
        artifactId: revision.artifactId,
        artifactType: revision.next.type,
        revisionId,
      });
    },

    verifyActiveArtifact() {
      const artifact = activeArtifact();
      if (!artifact) return;
      const verifiedIds = state.verifiedIds.includes(artifact.id)
        ? state.verifiedIds
        : [...state.verifiedIds, artifact.id];
      replaceState({ ...state, verifiedIds }, "mutation");
      emit("artifact.verified", { artifactId: artifact.id, artifactType: artifact.type });
    },

    reset() {
      replaceState(mountedInitialState ?? initialState(), "reset");
    },
  };
}

export const artifactPreviewRuntime = createArtifactPreviewRuntime();
