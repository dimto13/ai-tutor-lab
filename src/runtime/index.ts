import { copilotRuntime } from "./copilotRuntime";
import { vscodeRuntime } from "./vscodeRuntime";
import type { RuntimeAdapter } from "./runtimeAdapter";

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
