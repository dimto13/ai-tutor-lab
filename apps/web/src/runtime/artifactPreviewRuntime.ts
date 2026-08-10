import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef, WorkspaceEventName } from "../types/training.ts";
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
  selectArtifact(artifactId: string): boolean;
  applyRevision(revisionId: string): boolean;
  switchView(viewMode: ArtifactPreviewViewMode): void;
  verifyArtifact(artifactId?: string): boolean;
  getState(): ArtifactPreviewState;
  reset(): void;
}

function createIdentifier(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneState(state: ArtifactPreviewState): ArtifactPreviewState {
  return structuredClone(state);
}

function initialState(seed?: RuntimeSeed): ArtifactPreviewState {
  const parsed = parseArtifactPreviewSeed(seed);
  return {
    artifacts: parsed.artifacts,
    activeArtifactId: parsed.activeArtifactId,
    viewMode: parsed.viewMode,
    revisions: parsed.revisions,
    appliedRevisionIds: [],
    verifiedIds: [],
  };
}

function artifactById(state: ArtifactPreviewState, artifactId: string): PreviewArtifact | null {
  return state.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
}

function applyRevisionToState(
  state: ArtifactPreviewState,
  revision: ArtifactRevision,
): ArtifactPreviewState {
  const currentArtifact = artifactById(state, revision.artifactId);
  if (!currentArtifact) return state;

  const nextArtifact = previewArtifactSchema.parse({
    ...currentArtifact,
    ...revision.patch,
    id: currentArtifact.id,
    kind: currentArtifact.kind,
  });
  return {
    ...state,
    artifacts: state.artifacts.map((artifact) =>
      artifact.id === nextArtifact.id ? nextArtifact : artifact,
    ),
    activeArtifactId: nextArtifact.id,
    appliedRevisionIds: [...state.appliedRevisionIds, revision.id],
  };
}

function resolveMountedTarget(container: ParentNode | null, ref: UiTargetRef): DOMRect | null {
  if (!container || !(container instanceof Element || container instanceof Document)) return null;
  const element = container.querySelector<HTMLElement>(`[data-ui-target="${CSS.escape(ref)}"]`);
  return element?.getBoundingClientRect() ?? null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validSnapshot(value: unknown): value is ArtifactPreviewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.artifacts) || !Array.isArray(candidate.revisions)) return false;
  const seedResult = artifactPreviewSeedSchema.safeParse({
    artifacts: candidate.artifacts,
    revisions: candidate.revisions,
    activeArtifactId: candidate.activeArtifactId,
    viewMode: candidate.viewMode,
  });
  return (
    seedResult.success &&
    (candidate.activeArtifactId === null || typeof candidate.activeArtifactId === "string") &&
    stringArray(candidate.appliedRevisionIds) &&
    stringArray(candidate.verifiedIds)
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

  const emit = (type: WorkspaceEventName, payload: Record<string, unknown>): void => {
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
      mountedInitialState = cloneState(nextInitialState);
      replaceState(nextInitialState, "mount");
    },

    async unmount() {
      mountedContainer = null;
      eventListeners.clear();
      stateListeners.clear();
    },

    subscribe(handler) {
      eventListeners.add(handler);
      return () => eventListeners.delete(handler);
    },

    subscribeState(handler) {
      stateListeners.add(handler);
      return () => stateListeners.delete(handler);
    },

    async query<T = unknown>(selector: string): Promise<T> {
      const artifact = activeArtifact();
      let value: unknown;
      if (selector === "artifact.active.id") value = state.activeArtifactId;
      else if (selector === "artifact.active.kind") value = artifact?.kind ?? null;
      else if (selector === "artifact.viewMode") value = state.viewMode;
      else if (selector === "artifact.ids") value = state.artifacts.map((item) => item.id);
      else if (selector === "artifact.appliedRevisionIds") value = [...state.appliedRevisionIds];
      else if (selector === "artifact.verifiedIds") value = [...state.verifiedIds];
      else if (selector === "artifact.active") value = artifact ? structuredClone(artifact) : null;
      else throw new Error(`Unsupported artifact preview selector: ${selector}`);
      return value as T;
    },

    resolveTarget(ref) {
      if (!getArtifactPreviewTarget(ref)) return null;
      return resolveMountedTarget(mountedContainer, ref);
    },

    describeSurface(): RuntimeSurfaceDescription[] {
      return ARTIFACT_PREVIEW_DEFINITION.surface.map((item) => ({ ...item }));
    },

    async snapshot() {
      return cloneState(state);
    },

    async restore(snapshot) {
      if (!validSnapshot(snapshot)) throw new Error("Invalid artifact preview snapshot");
      replaceState(snapshot, "restore");
    },

    inspect(ref) {
      if (!getArtifactPreviewTarget(ref)) return;
      emit("ui.element.inspected", { ref });
    },

    selectArtifact(artifactId) {
      if (!artifactById(state, artifactId)) return false;
      replaceState({ ...state, activeArtifactId: artifactId }, "mutation");
      emit("artifact.selected", { artifactId });
      return true;
    },

    applyRevision(revisionId) {
      const revision = state.revisions.find((item) => item.id === revisionId);
      if (!revision || state.appliedRevisionIds.includes(revisionId)) return false;
      const existedBefore = Boolean(artifactById(state, revision.artifactId));
      const next = applyRevisionToState(state, revision);
      if (next === state) return false;
      replaceState(next, "mutation");
      emit(existedBefore ? "artifact.updated" : "artifact.created", {
        artifactId: revision.artifactId,
        revisionId,
      });
      return true;
    },

    switchView(viewMode) {
      if (state.viewMode === viewMode) return;
      replaceState({ ...state, viewMode }, "mutation");
      emit("artifact.viewSwitched", { viewMode, artifactId: state.activeArtifactId });
    },

    verifyArtifact(artifactId = state.activeArtifactId ?? undefined) {
      if (!artifactId || !artifactById(state, artifactId)) return false;
      if (!state.verifiedIds.includes(artifactId)) {
        replaceState({ ...state, verifiedIds: [...state.verifiedIds, artifactId] }, "mutation");
      }
      emit("artifact.verified", { artifactId });
      return true;
    },

    getState() {
      return cloneState(state);
    },

    reset() {
      const next = mountedInitialState ? cloneState(mountedInitialState) : initialState();
      replaceState(next, "reset");
    },
  };
}
