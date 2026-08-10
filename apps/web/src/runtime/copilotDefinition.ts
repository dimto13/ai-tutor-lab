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
    { ref: "copilot.chat", label: "Copilot Chat", conceptKey: "copilot.chat" },
    { ref: "copilot.chat.toggle", label: "Copilot Chat öffnen", conceptKey: "copilot.chat" },
    {
      ref: "copilot.chat.newConversation",
      label: "Neue Copilot-Unterhaltung",
      conceptKey: "copilot.session",
    },
    { ref: "copilot.chat.prompt", label: "Copilot Prompt", conceptKey: "ai.context" },
    {
      ref: "copilot.chat.modeSelector",
      label: "Copilot-Modus",
      conceptKey: "copilot.chat_mode",
    },
    {
      ref: "copilot.chat.modelSelector",
      label: "Copilot-Modellauswahl",
      conceptKey: "copilot.model_selection",
    },
    {
      ref: "copilot.inline.generate",
      label: "Inline-Vorschlag erzeugen",
      conceptKey: "copilot.inline_suggestion",
    },
    {
      ref: "copilot.inline.suggestion",
      label: "Inline-Vorschlag",
      conceptKey: "copilot.inline_suggestion",
    },
    {
      ref: "copilot.inline.accept",
      label: "Inline-Vorschlag annehmen",
      conceptKey: "copilot.inline_suggestion",
    },
    {
      ref: "copilot.inline.reject",
      label: "Inline-Vorschlag ablehnen",
      conceptKey: "copilot.inline_suggestion",
    },
  ],
  querySelectors: [
    "copilot.enabled",
    "copilot.chat.open",
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
