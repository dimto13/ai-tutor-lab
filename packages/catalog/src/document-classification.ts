import type { ClassificationDecision, ClassificationScheme } from "./classification.ts";
import { classifyByIndicators } from "./classification.ts";

export const supportedDocumentFormats = ["pdf", "docx", "xlsx", "txt"] as const;
export type SupportedDocumentFormat = (typeof supportedDocumentFormats)[number];

export interface DocumentSource {
  format: SupportedDocumentFormat;
  bytes: Uint8Array;
  fileName?: string;
}

export interface ExtractedDocument {
  format: SupportedDocumentFormat;
  text: string;
}

/**
 * Binary parsing deliberately lives behind this boundary. The classifier never
 * needs filesystem, cloud or network access and never logs document content.
 */
export interface DocumentTextExtractor {
  readonly format: SupportedDocumentFormat;
  extract(source: DocumentSource): Promise<ExtractedDocument> | ExtractedDocument;
}

export interface TenantKeywordRule {
  indicatorId: string;
  keywords: readonly string[];
}

export interface DocumentClassificationOptions {
  keywordRules?: readonly TenantKeywordRule[];
}

export interface DocumentClassificationResult extends ClassificationDecision {
  uncertain: boolean;
  reasons: readonly string[];
}

interface DetectionRule {
  indicatorId: string;
  reason: string;
  patterns: readonly RegExp[];
}

const builtinRules: readonly DetectionRule[] = [
  {
    indicatorId: "marking_internal",
    reason: "explizite interne Kennzeichnung erkannt",
    patterns: [/\bintern(?:e|er|es|en)?\b/iu, /\binternal\b/iu],
  },
  {
    indicatorId: "personal_data",
    reason: "Merkmal für Personenbezug erkannt",
    patterns: [
      /\b[A-ZÄÖÜ][a-zäöüß]{2,}\s+[A-ZÄÖÜ][a-zäöüß]{2,}\b/u,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
      /\b(?:personalnummer|mitarbeiter(?:in)?|kund(?:e|in))\b/iu,
    ],
  },
  {
    indicatorId: "customer_contract_data",
    reason: "Kunden- oder Vertragsbezug erkannt",
    patterns: [
      /\b(?:kundenvertrag|vertrag(?:swert)?|vertragsnummer|angebot)\b/iu,
      /\b(?:laufzeit|kundennummer)\b/iu,
    ],
  },
  {
    indicatorId: "salary_data",
    reason: "Gehalts- oder HR-Merkmal erkannt",
    patterns: [
      /\b(?:gehalt|gehaltsliste|monatsbrutto|brutto|payroll|bonus|vergütung|jahresvergütung|lohnabrechnung)\b/iu,
      /\bHR\b/u,
    ],
  },
];

function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function configuredIndicatorIds(scheme: ClassificationScheme): Set<string> {
  return new Set(scheme.indicators.map((indicator) => indicator.id));
}

function detectBuiltinIndicators(
  scheme: ClassificationScheme,
  text: string,
): { ids: string[]; reasons: string[] } {
  const available = configuredIndicatorIds(scheme);
  const ids: string[] = [];
  const reasons: string[] = [];

  for (const rule of builtinRules) {
    if (!available.has(rule.indicatorId)) continue;
    if (!rule.patterns.some((pattern) => pattern.test(text))) continue;
    ids.push(rule.indicatorId);
    reasons.push(rule.reason);
  }

  return { ids, reasons };
}

function detectTenantKeywords(
  scheme: ClassificationScheme,
  text: string,
  keywordRules: readonly TenantKeywordRule[],
): { ids: string[]; reasons: string[] } {
  const available = configuredIndicatorIds(scheme);
  const folded = text.toLocaleLowerCase("de-DE");
  const ids: string[] = [];
  const reasons: string[] = [];

  for (const rule of keywordRules) {
    if (!available.has(rule.indicatorId)) {
      throw new Error(
        `Unknown classification indicator in tenant keyword rule: ${rule.indicatorId}`,
      );
    }
    const matched = rule.keywords.some((keyword) => {
      const normalized = normalizeText(keyword).toLocaleLowerCase("de-DE");
      return normalized.length > 0 && folded.includes(normalized);
    });
    if (!matched) continue;
    ids.push(rule.indicatorId);
    reasons.push(`mandantenspezifisches Schlüsselwort für ${rule.indicatorId} erkannt`);
  }

  return { ids, reasons };
}

export function classifyExtractedDocument(
  scheme: ClassificationScheme,
  document: ExtractedDocument,
  options: DocumentClassificationOptions = {},
): DocumentClassificationResult {
  if (!supportedDocumentFormats.includes(document.format)) {
    throw new Error(`Unsupported document format: ${String(document.format)}`);
  }

  const text = normalizeText(document.text);
  const builtin = detectBuiltinIndicators(scheme, text);
  const tenant = detectTenantKeywords(scheme, text, options.keywordRules ?? []);
  const indicatorIds = [...new Set([...builtin.ids, ...tenant.ids])];

  // Empty/unreadable content is never silently classified as harmless. Likewise,
  // non-empty content with no recognizable signal requires a human decision.
  const uncertain = text.length === 0 || indicatorIds.length === 0;
  const decision = classifyByIndicators(scheme, indicatorIds, { uncertain });

  return {
    ...decision,
    uncertain,
    reasons: [
      ...builtin.reasons,
      ...tenant.reasons,
      ...(uncertain
        ? ["keine belastbare automatische Einstufung; menschliche Prüfung erforderlich"]
        : []),
    ],
  };
}

export async function classifyDocument(
  scheme: ClassificationScheme,
  source: DocumentSource,
  extractors: readonly DocumentTextExtractor[],
  options: DocumentClassificationOptions = {},
): Promise<DocumentClassificationResult> {
  const extractor = extractors.find((candidate) => candidate.format === source.format);
  if (!extractor) {
    throw new Error(`No document text extractor configured for format: ${source.format}`);
  }
  const extracted = await extractor.extract(source);
  if (extracted.format !== source.format) {
    throw new Error(
      `Document extractor format mismatch: expected ${source.format}, got ${extracted.format}`,
    );
  }
  return classifyExtractedDocument(scheme, extracted, options);
}

export function createUtf8TextExtractor(): DocumentTextExtractor {
  return {
    format: "txt",
    extract(source) {
      return {
        format: "txt",
        text: new TextDecoder("utf-8", { fatal: true }).decode(source.bytes),
      };
    },
  };
}
