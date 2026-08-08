import { vscodeRuntime } from "./vscodeRuntime";
import type { RuntimeAdapter } from "./runtimeAdapter";

export type {
  RuntimeAdapter,
  RuntimeCapability,
  RuntimeSeed,
  RuntimeSurfaceDescription,
} from "./runtimeAdapter";

const runtimes: Record<string, RuntimeAdapter> = {
  [vscodeRuntime.id]: vscodeRuntime,
};

export function getRuntimeAdapter(runtimeAdapterId: string | undefined): RuntimeAdapter | null {
  if (!runtimeAdapterId) return null;
  return runtimes[runtimeAdapterId] ?? null;
}
