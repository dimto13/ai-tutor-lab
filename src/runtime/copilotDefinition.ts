import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeReferenceDefinition } from "./vscodeDefinition.ts";
import type { RuntimeSurfaceDescription } from "./runtimeAdapter.ts";

export interface CopilotRuntimeReferenceDefinition extends RuntimeReferenceDefinition {
  hostProductId: "vscode";
}

export const COPILOT_RUNTIME_DEFINITION = {
  id: "github-copilot-vscode-simulator",
  productId: "github-copilot",
  hostProductId: "vscode",
  surface: [
    { ref: "copilot.chat", label: "Copilot Chat", conceptKey: "github.copilot" },
    { ref: "copilot.chat.toggle", label: "Copilot Chat öffnen", conceptKey: "github.copilot" },
    {
      ref: "copilot.chat.newConversation",
      label: "Neue Copilot-Unterhaltung",
      conceptKey: "github.copilot",
    },
    { ref: "copilot.chat.prompt", label: "Copilot Prompt", conceptKey: "github.copilot" },
    {
      ref: "copilot.chat.modeSelector",
      label: "Copilot-Modus",
      conceptKey: "github.copilot",
    },
    {
      ref: "copilot.chat.modelSelector",
      label: "Copilot-Modellauswahl",
      conceptKey: "github.copilot",
    },
    {
      ref: "copilot.inline.suggestion",
      label: "Inline-Vorschlag",
      conceptKey: "github.copilot",
    },
    {
      ref: "copilot.inline.accept",
      label: "Inline-Vorschlag annehmen",
      conceptKey: "github.copilot",
    },
    {
      ref: "copilot.inline.reject",
      label: "Inline-Vorschlag ablehnen",
      conceptKey: "github.copilot",
    },
  ],
  querySelectors: [
    "copilot.enabled",
    "copilot.profile.id",
    "copilot.product.version",
    "copilot.conversation.id",
    "copilot.conversation.messageCount",
    "copilot.mode",
    "copilot.model",
    "copilot.context.activeFile",
    "copilot.inline.status",
  ],
} as const satisfies CopilotRuntimeReferenceDefinition;

export function getCopilotSurfaceTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return COPILOT_RUNTIME_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
