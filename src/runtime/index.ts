import { copilotRuntime } from "./copilotRuntime";
import { getRuntimeReferenceDefinition } from "./referenceCatalog";
import { vscodeRuntime } from "./vscodeRuntime";
import type { RuntimeAdapter } from "./runtimeAdapter";
import type { UiTargetRef } from "../types/training";

export type {
  RuntimeAdapter,
  RuntimeCapability,
  RuntimeSeed,
  RuntimeSurfaceDescription,
} from "./runtimeAdapter";
export type { CopilotRuntimeAdapter, CopilotRuntimeState } from "./copilotRuntime";
export type { CopilotProductProfile } from "./copilotProductProfile";

const runtimes: Record<string, RuntimeAdapter> = {
  [vscodeRuntime.id]: vscodeRuntime,
  [copilotRuntime.id]: copilotRuntime,
};

export function getRuntimeAdapter(runtimeAdapterId: string | undefined): RuntimeAdapter | null {
  if (!runtimeAdapterId) return null;
  return runtimes[runtimeAdapterId] ?? null;
}

export function getRuntimeAdapters(
  runtimeAdapterId: string | undefined,
  integrationRuntimeAdapterIds: readonly string[] = [],
): RuntimeAdapter[] {
  const ids = [runtimeAdapterId, ...integrationRuntimeAdapterIds].filter(
    (id): id is string => Boolean(id),
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
