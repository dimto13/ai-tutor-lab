import type { GlossaryConcept } from "@/lib/glossary";

export interface GuidedConceptHighlightDetail {
  conceptKey: string;
  term: string;
  targetIds: string[];
}

type GuidedConceptHighlightListener = () => void;

let currentConceptHighlight: GuidedConceptHighlightDetail | null = null;
const conceptHighlightListeners = new Set<GuidedConceptHighlightListener>();

function isSameHighlight(
  left: GuidedConceptHighlightDetail | null,
  right: GuidedConceptHighlightDetail | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.conceptKey === right.conceptKey &&
    left.term === right.term &&
    left.targetIds.length === right.targetIds.length &&
    left.targetIds.every((targetId, index) => targetId === right.targetIds[index])
  );
}

export function getGuidedConceptHighlight(): GuidedConceptHighlightDetail | null {
  return currentConceptHighlight;
}

export function getGuidedConceptHighlightServerSnapshot(): GuidedConceptHighlightDetail | null {
  return null;
}

export function subscribeGuidedConceptHighlight(listener: GuidedConceptHighlightListener): () => void {
  conceptHighlightListeners.add(listener);
  return () => conceptHighlightListeners.delete(listener);
}

export function requestGuidedConceptHighlight(concept: GlossaryConcept | null): void {
  const nextHighlight: GuidedConceptHighlightDetail | null = concept
    ? {
        conceptKey: concept.key,
        term: concept.term,
        targetIds: [...concept.uiTargets],
      }
    : null;

  if (isSameHighlight(currentConceptHighlight, nextHighlight)) return;
  currentConceptHighlight = nextHighlight;
  for (const listener of conceptHighlightListeners) listener();
}
