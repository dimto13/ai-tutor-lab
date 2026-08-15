import type { GlossaryConcept } from "@/lib/glossary";

export const GUIDED_CONCEPT_HIGHLIGHT_EVENT = "ai-training-lab:guided-concept-highlight";

export interface GuidedConceptHighlightDetail {
  conceptKey: string;
  term: string;
  targetIds: string[];
}

export function requestGuidedConceptHighlight(concept: GlossaryConcept | null): void {
  const detail: GuidedConceptHighlightDetail | null = concept
    ? {
        conceptKey: concept.key,
        term: concept.term,
        targetIds: [...concept.uiTargets],
      }
    : null;

  window.dispatchEvent(
    new CustomEvent<GuidedConceptHighlightDetail | null>(GUIDED_CONCEPT_HIGHLIGHT_EVENT, {
      detail,
    }),
  );
}
