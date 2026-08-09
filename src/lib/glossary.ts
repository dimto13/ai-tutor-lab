import glossaryData from "../../content/glossary/de.json" with { type: "json" };
import productGlossaryData from "../../content/glossary/products.de.json" with { type: "json" };
import type { TechnologyId } from "../types/training";

export interface GlossaryConcept {
  key: string;
  term: string;
  aliases: string[];
  simple: string;
  advanced: string;
  uiTargets: string[];
}

interface GlossaryDataSource {
  concepts: GlossaryConcept[];
  technologyConcepts: Partial<Record<TechnologyId, string[]>>;
}

const glossarySources = [glossaryData, productGlossaryData] as unknown as GlossaryDataSource[];
const concepts = glossarySources.flatMap((source) => source.concepts);
const technologyConcepts = glossarySources.reduce<Partial<Record<TechnologyId, string[]>>>(
  (merged, source) => {
    for (const [technologyId, conceptKeys] of Object.entries(source.technologyConcepts)) {
      const id = technologyId as TechnologyId;
      merged[id] = [...(merged[id] ?? []), ...conceptKeys];
    }
    return merged;
  },
  {},
);

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

export function getGlossaryConceptsForTechnology(technologyId: TechnologyId): GlossaryConcept[] {
  const keys = new Set(technologyConcepts[technologyId] ?? []);
  return concepts.filter((concept) => keys.has(concept.key));
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

export interface GlossaryTextSegment {
  text: string;
  concept?: GlossaryConcept;
}

interface GlossaryMatch {
  start: number;
  end: number;
  concept: GlossaryConcept;
}

const isWordCharacter = (value: string | undefined) =>
  value !== undefined && /[\p{L}\p{N}]/u.test(value);

export function segmentGlossaryText(
  text: string,
  conceptKeys: readonly string[],
): GlossaryTextSegment[] {
  if (!text || conceptKeys.length === 0) return [{ text }];

  const selectedKeys = new Set(conceptKeys);
  const lowerText = text.toLocaleLowerCase("de");
  const matches: GlossaryMatch[] = [];

  for (const concept of concepts) {
    if (!selectedKeys.has(concept.key)) continue;
    const candidates = [...new Set([concept.term, ...concept.aliases])].sort(
      (left, right) => right.length - left.length,
    );
    for (const candidate of candidates) {
      const lowerCandidate = candidate.toLocaleLowerCase("de");
      let start = lowerText.indexOf(lowerCandidate);
      while (start >= 0) {
        const end = start + lowerCandidate.length;
        if (!isWordCharacter(text[start - 1]) && !isWordCharacter(text[end])) {
          matches.push({ start, end, concept });
        }
        start = lowerText.indexOf(lowerCandidate, start + 1);
      }
    }
  }

  matches.sort(
    (left, right) => left.start - right.start || right.end - right.start - (left.end - left.start),
  );
  const accepted: GlossaryMatch[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    accepted.push(match);
    cursor = match.end;
  }
  if (accepted.length === 0) return [{ text }];

  const segments: GlossaryTextSegment[] = [];
  cursor = 0;
  for (const match of accepted) {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start) });
    segments.push({ text: text.slice(match.start, match.end), concept: match.concept });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
