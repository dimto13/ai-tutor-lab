import {
  VSCODE_RUNTIME_DEFINITION,
  type RuntimeReferenceDefinition,
} from "./vscodeDefinition.ts";

export const RUNTIME_REFERENCE_CATALOG: readonly RuntimeReferenceDefinition[] = [
  VSCODE_RUNTIME_DEFINITION,
];

export function getRuntimeReferenceDefinition(
  runtimeAdapterId: string,
): RuntimeReferenceDefinition | null {
  return RUNTIME_REFERENCE_CATALOG.find((runtime) => runtime.id === runtimeAdapterId) ?? null;
}
