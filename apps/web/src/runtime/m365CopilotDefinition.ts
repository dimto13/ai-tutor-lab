import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeReferenceDefinition } from "./vscodeDefinition.ts";
import type { RuntimeSurfaceDescription } from "./runtimeAdapter.ts";

export const M365_COPILOT_RUNTIME_DEFINITION = {
  id: "m365-copilot-simulator",
  productId: "m365-copilot",
  surface: [
    { ref: "m365.nav.newChat", label: "New chat", conceptKey: "m365.chat" },
    { ref: "m365.nav.search", label: "Search", conceptKey: "m365.search" },
    { ref: "m365.nav.library", label: "Library", conceptKey: "m365.library" },
    { ref: "m365.nav.create", label: "Create", conceptKey: "m365.create" },
    { ref: "m365.nav.agents", label: "Agents", conceptKey: "m365.agents" },
    { ref: "m365.grounding", label: "Work oder Web", conceptKey: "ai.context" },
    { ref: "m365.context", label: "Kontext hinzufügen", conceptKey: "ai.context" },
    { ref: "m365.context.restricted", label: "Vertraulicher Anhang", conceptKey: "ai.context" },
    { ref: "m365.prompt", label: "Message Copilot", conceptKey: "ai.prompt" },
    { ref: "m365.prompt.submit", label: "Nachricht senden", conceptKey: "ai.prompt" },
    { ref: "m365.result", label: "Copilot-Antwort", conceptKey: "ai.result" },
    { ref: "m365.result.sources", label: "Verwendete Quellen", conceptKey: "ai.review" },
    { ref: "m365.review.facts", label: "Faktenprüfung", conceptKey: "ai.review" },
    {
      ref: "m365.unsupported.reject",
      label: "Unbelegte Aussage verwerfen",
      conceptKey: "ai.review",
    },
    { ref: "m365.approval", label: "Freigabeentscheidung", conceptKey: "ai.approval" },
  ],
  querySelectors: [
    "m365.grounding.mode",
    "m365.context.sourceCount",
    "m365.context.restrictedAttempted",
    "m365.prompt.submitted",
    "m365.prompt.qualityComplete",
    "m365.chat.responseVisible",
    "m365.review.factsChecked",
    "m365.review.unsupportedRejected",
    "m365.approval.decision",
  ],
} as const satisfies RuntimeReferenceDefinition;

export function getM365CopilotSurfaceTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return M365_COPILOT_RUNTIME_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
