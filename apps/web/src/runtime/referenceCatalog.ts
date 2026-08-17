import { ARTIFACT_PREVIEW_DEFINITION } from "./artifactPreviewDefinition.ts";
import { CLASSIFICATION_RUNTIME_DEFINITION } from "./classificationDefinition.ts";
import { CLAUDE_CODE_DEFINITION } from "./claudeCodeDefinition.ts";
import { COPILOT_RUNTIME_DEFINITION } from "./copilotDefinition.ts";
import { SOURCE_CONTROL_PLATFORM_DEFINITION } from "./sourceControlPlatformDefinition.ts";
import { VSCODE_RUNTIME_DEFINITION, type RuntimeReferenceDefinition } from "./vscodeDefinition.ts";

export const RUNTIME_REFERENCE_CATALOG: readonly RuntimeReferenceDefinition[] = [
  VSCODE_RUNTIME_DEFINITION,
  COPILOT_RUNTIME_DEFINITION,
  ARTIFACT_PREVIEW_DEFINITION,
  SOURCE_CONTROL_PLATFORM_DEFINITION,
  CLAUDE_CODE_DEFINITION,
  CLASSIFICATION_RUNTIME_DEFINITION,
];

export function getRuntimeReferenceDefinition(
  runtimeAdapterId: string,
): RuntimeReferenceDefinition | null {
  return RUNTIME_REFERENCE_CATALOG.find((runtime) => runtime.id === runtimeAdapterId) ?? null;
}
