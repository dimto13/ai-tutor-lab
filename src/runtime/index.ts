import { vscodeRuntime } from "./vscodeRuntime";
import type { UiTargetRef } from "@/types/training";

export interface RuntimeQueryAdapter {
  id: string;
  productId: string;
  query(selector: string): unknown;
  reset?: () => void;
  resolveTarget?: (ref: UiTargetRef) => HTMLElement | null;
}

const runtimes: Record<string, RuntimeQueryAdapter> = {
  [vscodeRuntime.id]: vscodeRuntime,
};

export function getRuntimeAdapter(runtimeAdapterId: string | undefined): RuntimeQueryAdapter | null {
  if (!runtimeAdapterId) return null;
  return runtimes[runtimeAdapterId] ?? null;
}
