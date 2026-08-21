import type { ClassificationScheme } from "./classification.ts";
import type {
  DocumentClassificationOptions,
  DocumentClassificationResult,
  DocumentSource,
  DocumentTextExtractor,
  SupportedDocumentFormat,
} from "./document-classification.ts";
import { classifyDocument } from "./document-classification.ts";
import type { BoundaryLlmClassificationOptions } from "./tenant-llm-classification.ts";
import { applyBoundaryLlmClassification } from "./tenant-llm-classification.ts";

export interface TenantDocumentCheckContext {
  tenantId: string;
  userId: string;
}

export interface DocumentCheckAuditRecord {
  timestamp: string;
  fileType: SupportedDocumentFormat;
  levelId: string;
  indicatorIds: readonly string[];
  userId: string;
}

/** Persistence boundary intentionally accepts metadata only, never source bytes/text. */
export interface DocumentCheckAuditSink {
  persist(record: DocumentCheckAuditRecord): Promise<void> | void;
}

export interface DocumentCheckToolDecision {
  tool: string;
  allowed: boolean;
}

export interface TenantDocumentCheckResult {
  levelId: string;
  reasons: readonly string[];
  indicatorIds: readonly string[];
  approvalMatrix: readonly DocumentCheckToolDecision[];
  requiresHumanReview: boolean;
  disclaimer: string;
  learningUnitHref: string;
}

export interface TenantDocumentCheckServiceOptions {
  tenantId: string;
  scheme: ClassificationScheme;
  extractors: readonly DocumentTextExtractor[];
  auditSink: DocumentCheckAuditSink;
  learningUnitHref: string;
  classification?: DocumentClassificationOptions;
  llmClassification?: BoundaryLlmClassificationOptions;
  now?: () => Date;
}

const DEFAULT_DISCLAIMER =
  "Die automatische Einstufung ist eine Entscheidungshilfe. Unternehmensrichtlinien und erforderliche Freigaben bleiben verbindlich.";

function toResult(
  classification: DocumentClassificationResult,
  learningUnitHref: string,
): TenantDocumentCheckResult {
  return {
    levelId: classification.levelId,
    reasons: classification.reasons,
    indicatorIds: classification.triggeredIndicatorIds,
    approvalMatrix: Object.entries(classification.aiDecisions).map(([tool, allowed]) => ({
      tool,
      allowed,
    })),
    requiresHumanReview: classification.requiresHumanReview,
    disclaimer: DEFAULT_DISCLAIMER,
    learningUnitHref,
  };
}

/**
 * Creates one document-check boundary for exactly one tenant deployment.
 * Document bytes and extracted text stay inside check() and are never handed to
 * persistence. The optional LLM port, when enabled with explicit tenant opt-in,
 * receives the source only inside the same tenant boundary. The only durable
 * output is the explicitly reduced audit record.
 */
export function createTenantDocumentCheckService(options: TenantDocumentCheckServiceOptions) {
  if (options.scheme.tenantId !== options.tenantId) {
    throw new Error("Document-check scheme tenant does not match boundary tenant");
  }
  if (!options.learningUnitHref.trim()) {
    throw new Error("Document-check learning unit link must be configured");
  }

  const now = options.now ?? (() => new Date());

  return {
    async check(
      context: TenantDocumentCheckContext,
      source: DocumentSource,
    ): Promise<TenantDocumentCheckResult> {
      if (context.tenantId !== options.tenantId) {
        throw new Error("Cross-tenant document check denied");
      }
      if (!context.userId.trim()) {
        throw new Error("Authenticated user id is required for document check");
      }

      const deterministic = await classifyDocument(
        options.scheme,
        source,
        options.extractors,
        options.classification,
      );
      const classification = await applyBoundaryLlmClassification(
        options.scheme,
        context,
        source,
        deterministic,
        options.llmClassification,
      );
      const result = toResult(classification, options.learningUnitHref);

      await options.auditSink.persist({
        timestamp: now().toISOString(),
        fileType: source.format,
        levelId: result.levelId,
        indicatorIds: [...result.indicatorIds],
        userId: context.userId,
      });

      return result;
    },
  };
}
