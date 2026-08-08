import glossaryData from "../../content/glossary/de.json";

export interface GlossaryConcept {
  key: string;
  term: string;
  aliases: string[];
  simple: string;
  advanced: string;
  uiTargets: string[];
}

const concepts = glossaryData.concepts as GlossaryConcept[];

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("de")
    .replace(/[._/\\-]+/g, " ")
    .replace(/[^a-z0-9äöüß ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export function getGlossaryConcepts(): GlossaryConcept[] {
  return concepts;
}

export function getGlossaryConceptByKey(key: string | undefined): GlossaryConcept | null {
  if (!key) return null;
  return concepts.find((concept) => concept.key === key) ?? null;
}

export function getGlossaryConceptForTarget(
  target: string | null | undefined,
): GlossaryConcept | null {
  if (!target) return null;
  return concepts.find((concept) => concept.uiTargets.includes(target)) ?? null;
}

export function findGlossaryConcept(question: string): GlossaryConcept | null {
  const q = normalize(question);
  if (!q) return null;

  if (q.includes("git") && q.includes("github")) {
    return getGlossaryConceptByKey("git.github_difference");
  }

  let best: { concept: GlossaryConcept; score: number } | null = null;
  for (const concept of concepts) {
    const candidates = [concept.term, ...concept.aliases].map(normalize).filter(Boolean);
    for (const candidate of candidates) {
      const score =
        q === candidate ? 1000 + candidate.length : q.includes(candidate) ? candidate.length : 0;
      if (score > 0 && (!best || score > best.score)) best = { concept, score };
    }
  }
  return best?.concept ?? null;
}
