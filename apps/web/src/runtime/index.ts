import { artifactPreviewRuntime } from "./artifactPreviewRuntime.ts";
import { claudeCodeRuntime } from "./claudeCodeRuntime.ts";
import { copilotRuntime } from "./copilotRuntime.ts";
import { getRuntimeReferenceDefinition } from "./referenceCatalog.ts";
import { sourceControlPlatformRuntime } from "./sourceControlPlatformRuntime.ts";
import { vscodeRuntime } from "./vscodeRuntime.ts";
import type { RuntimeAdapter } from "./runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef } from "../types/training.ts";

export type {
  RuntimeAdapter,
  RuntimeCapability,
  RuntimeSeed,
  RuntimeSurfaceDescription,
} from "./runtimeAdapter.ts";
export type { CopilotRuntimeAdapter, CopilotRuntimeState } from "./copilotRuntime.ts";
export type { CopilotProductProfile } from "./copilotProductProfile.ts";
export type {
  ArtifactPreviewRuntimeAdapter,
  ArtifactPreviewState,
} from "./artifactPreviewRuntime.ts";
export type {
  ArtifactPreviewSeed,
  DataArtifact,
  HtmlArtifact,
  PreviewArtifact,
  TableArtifact,
} from "./artifactPreviewContent.ts";
export type {
  SourceControlPlatformAdapter,
  SourceControlPlatformState,
} from "./sourceControlPlatformRuntime.ts";
export type {
  ClaudeCodeChangeProposal,
  ClaudeCodeRuntimeAdapter,
  ClaudeCodeSeed,
  ClaudeCodeState,
} from "./claudeCodeRuntime.ts";

interface CopilotSnapshotEnvelope {
  kind: "copilot-prompt-context-v1";
  runtime: unknown;
  promptContextFile: string | null;
}

let copilotPromptContextFile: string | null = null;

function promptContextFromEvent(event: TrainingEvent): string | null | undefined {
  if (event.type !== "copilot.prompt.submitted") return undefined;
  const payload = event.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const activeFile = (payload as Record<string, unknown>)["activeFile"];
  return typeof activeFile === "string" ? activeFile : null;
}

function isCopilotSnapshotEnvelope(value: unknown): value is CopilotSnapshotEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CopilotSnapshotEnvelope>;
  return (
    candidate.kind === "copilot-prompt-context-v1" &&
    Object.prototype.hasOwnProperty.call(candidate, "runtime") &&
    (candidate.promptContextFile === null || typeof candidate.promptContextFile === "string")
  );
}

const registeredCopilotRuntime: RuntimeAdapter = {
  ...copilotRuntime,

  async mount(container, seed) {
    copilotPromptContextFile = null;
    await copilotRuntime.mount(container, seed);
  },

  async unmount() {
    copilotPromptContextFile = null;
    await copilotRuntime.unmount();
  },

  subscribe(handler) {
    return copilotRuntime.subscribe((event) => {
      const promptContext = promptContextFromEvent(event);
      if (promptContext !== undefined) copilotPromptContextFile = promptContext;
      handler(event);
    });
  },

  async query<T = unknown>(selector: string): Promise<T> {
    if (selector === "copilot.prompt.contextFile") return copilotPromptContextFile as T;
    return copilotRuntime.query<T>(selector);
  },

  async snapshot(): Promise<CopilotSnapshotEnvelope> {
    return {
      kind: "copilot-prompt-context-v1",
      runtime: await copilotRuntime.snapshot(),
      promptContextFile: copilotPromptContextFile,
    };
  },

  async restore(snapshot: unknown): Promise<void> {
    if (isCopilotSnapshotEnvelope(snapshot)) {
      copilotPromptContextFile = snapshot.promptContextFile;
      await copilotRuntime.restore(snapshot.runtime);
      return;
    }
    copilotPromptContextFile = null;
    await copilotRuntime.restore(snapshot);
  },

  reset() {
    copilotPromptContextFile = null;
    copilotRuntime.reset();
  },
};

const runtimes: Record<string, RuntimeAdapter> = {
  [vscodeRuntime.id]: vscodeRuntime,
  [registeredCopilotRuntime.id]: registeredCopilotRuntime,
  [artifactPreviewRuntime.id]: artifactPreviewRuntime,
  [sourceControlPlatformRuntime.id]: sourceControlPlatformRuntime,
  [claudeCodeRuntime.id]: claudeCodeRuntime,
};

export function getRuntimeAdapter(runtimeAdapterId: string | undefined): RuntimeAdapter | null {
  if (!runtimeAdapterId) return null;
  return runtimes[runtimeAdapterId] ?? null;
}

export function getRuntimeAdapters(
  runtimeAdapterId: string | undefined,
  integrationRuntimeAdapterIds: readonly string[] = [],
): RuntimeAdapter[] {
  const ids = [runtimeAdapterId, ...integrationRuntimeAdapterIds].filter((id): id is string =>
    Boolean(id),
  );
  return [...new Set(ids)]
    .map((id) => getRuntimeAdapter(id))
    .filter((runtime): runtime is RuntimeAdapter => Boolean(runtime));
}

export function getRuntimeAdapterForSelector(
  selector: string,
  runtimeAdapterId: string | undefined,
  integrationRuntimeAdapterIds: readonly string[] = [],
): RuntimeAdapter | null {
  for (const runtime of getRuntimeAdapters(runtimeAdapterId, integrationRuntimeAdapterIds)) {
    const definition = getRuntimeReferenceDefinition(runtime.id);
    if (definition?.querySelectors.includes(selector)) return runtime;
  }
  return null;
}

export function getRuntimeAdapterForTarget(
  targetRef: UiTargetRef,
  runtimeAdapterId: string | undefined,
  integrationRuntimeAdapterIds: readonly string[] = [],
): RuntimeAdapter | null {
  for (const runtime of getRuntimeAdapters(runtimeAdapterId, integrationRuntimeAdapterIds)) {
    const definition = getRuntimeReferenceDefinition(runtime.id);
    if (definition?.surface.some((entry) => entry.ref === targetRef)) return runtime;
  }
  return null;
}
