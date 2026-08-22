import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeReferenceDefinition } from "./vscodeDefinition.ts";
import type { RuntimeSurfaceDescription } from "./runtimeAdapter.ts";

export const M365_COPILOT_RUNTIME_DEFINITION = {
  id: "m365-copilot-simulator",
  productId: "m365-copilot",
  surface: [
    { ref: "m365.nav.teams", label: "Teams", conceptKey: "m365.teams" },
    { ref: "m365.nav.word", label: "Word", conceptKey: "m365.word" },
    { ref: "m365.nav.outlook", label: "Outlook", conceptKey: "m365.outlook" },
    { ref: "m365.sources", label: "Freigegebene Quellen", conceptKey: "ai.context" },
    { ref: "m365.prompt", label: "Copilot-Arbeitsauftrag", conceptKey: "ai.prompt" },
    { ref: "m365.prompt.submit", label: "Arbeitsauftrag absenden", conceptKey: "ai.prompt" },
    { ref: "m365.result", label: "Copilot-Entwurf", conceptKey: "ai.result" },
    { ref: "m365.review.facts", label: "Faktenprüfung", conceptKey: "ai.review" },
    {
      ref: "m365.unsupported.reject",
      label: "Unbelegte Aussage verwerfen",
      conceptKey: "ai.review",
    },
    { ref: "m365.approval", label: "Freigabeentscheidung", conceptKey: "ai.approval" },
  ],
  querySelectors: [
    "m365.activeApp",
    "m365.approvedSourceCount",
    "m365.prompt.submitted",
    "m365.prompt.qualityComplete",
    "m365.draft.kind",
    "m365.review.factsChecked",
    "m365.review.unsupportedRejected",
    "m365.approval.decision",
  ],
} as const satisfies RuntimeReferenceDefinition;

export function getM365CopilotSurfaceTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return M365_COPILOT_RUNTIME_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
