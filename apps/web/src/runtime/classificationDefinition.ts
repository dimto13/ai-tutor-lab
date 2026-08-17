import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { RuntimeReferenceDefinition } from "./vscodeDefinition.ts";

export const CLASSIFICATION_RUNTIME_DEFINITION = {
  id: "classification-simulator",
  productId: "classification",
  surface: [
    {
      ref: "classification.document.list",
      label: "Synthetische Dokumente",
      conceptKey: "classification.document",
    },
    {
      ref: "classification.document.preview",
      label: "Dokumentvorschau",
      conceptKey: "classification.document",
    },
    {
      ref: "classification.indicators",
      label: "Klassifizierungsmerkmale",
      conceptKey: "classification.indicators",
    },
    {
      ref: "classification.levels",
      label: "Klassifizierungsstufen",
      conceptKey: "classification.level",
    },
    {
      ref: "classification.aiDecision",
      label: "Entscheidung zur KI-Nutzung",
      conceptKey: "classification.ai_policy",
    },
  ],
  querySelectors: [
    "classification.document.id",
    "classification.document.current",
    "classification.document.viewedIds",
    "classification.indicators.marked",
    "classification.level.selected",
    "classification.ai.tool",
    "classification.ai.decision",
    "classification.ai.decisions",
    "classification.ai.policyAllowed",
  ],
} as const satisfies RuntimeReferenceDefinition;

export function getClassificationTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return CLASSIFICATION_RUNTIME_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
