import { vscodeRuntime } from "./vscodeRuntime";

export interface RuntimeQueryAdapter {
  id: string;
  productId: string;
  query(selector: string): unknown;
}

const runtimes: Record<string, RuntimeQueryAdapter> = {
  [vscodeRuntime.id]: vscodeRuntime,
};

export function getRuntimeAdapter(runtimeAdapterId: string | undefined): RuntimeQueryAdapter | null {
  if (!runtimeAdapterId) return null;
  return runtimes[runtimeAdapterId] ?? null;
}
