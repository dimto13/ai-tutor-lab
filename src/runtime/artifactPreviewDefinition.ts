import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { RuntimeReferenceDefinition } from "./vscodeDefinition.ts";

export interface ArtifactPreviewReferenceDefinition extends RuntimeReferenceDefinition {
  hostProductId: "vscode";
}

export const ARTIFACT_PREVIEW_DEFINITION = {
  id: "artifact-preview-simulator",
  productId: "artifact-preview",
  hostProductId: "vscode",
  surface: [
    {
      ref: "artifact.preview.panel",
      label: "Artefakt-Vorschau",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.selector",
      label: "Artefakt-Auswahl",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.rendered",
      label: "Gerenderte HTML-Vorschau",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.source",
      label: "HTML-Quelltext",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.table",
      label: "Tabellenartefakt",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.data",
      label: "Strukturiertes Datenartefakt",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.viewToggle",
      label: "Vorschau- und Quelltextumschaltung",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.applyRevision",
      label: "Hinterlegte Artefakt-Revision",
      conceptKey: "artifact.preview",
    },
    {
      ref: "artifact.preview.verify",
      label: "Artefakt-Prüfung",
      conceptKey: "artifact.preview",
    },
  ],
  querySelectors: [
    "artifact.active.id",
    "artifact.active.type",
    "artifact.viewMode",
    "artifact.items",
    "artifact.current",
    "artifact.current.revision",
    "artifact.appliedRevisionIds",
    "artifact.verified",
    "artifact.verifiedIds",
  ],
} as const satisfies ArtifactPreviewReferenceDefinition;

export function getArtifactPreviewTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return ARTIFACT_PREVIEW_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
