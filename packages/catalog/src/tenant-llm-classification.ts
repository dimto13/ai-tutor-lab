import type { ClassificationScheme } from "./classification.ts";
import { getClassificationLevelRank, isAiToolAllowed } from "./classification.ts";
import type { DocumentClassificationResult, DocumentSource } from "./document-classification.ts";
import type { TenantDocumentCheckContext } from "./tenant-document-check.ts";

export interface BoundaryLlmClassificationRequest {
  tenantId: string;
  userId: string;
  source: DocumentSource;
  deterministicLevelId: string;
  deterministicIndicatorIds: readonly string[];
}

export interface BoundaryLlmClassificationProposal {
  levelId: string;
  rationale: string;
}

/** Provider-neutral port. Implementations must run inside the tenant boundary. */
export interface BoundaryLlmClassifier {
  classify(
    request: BoundaryLlmClassificationRequest,
  ): Promise<BoundaryLlmClassificationProposal> | BoundaryLlmClassificationProposal;
}

export interface BoundaryLlmClassificationOptions {
  enabled: boolean;
  tenantOptIn: boolean;
  classifier?: BoundaryLlmClassifier;
}

/**
 * Applies the optional LLM stage monotonically: it may confirm or raise the
 * deterministic level, never lower it. Missing/disabled/unavailable models
 * preserve the deterministic result so #68 remains fully functional.
 */
export async function applyBoundaryLlmClassification(
  scheme: ClassificationScheme,
  context: TenantDocumentCheckContext,
  source: DocumentSource,
  deterministic: DocumentClassificationResult,
  options?: BoundaryLlmClassificationOptions,
): Promise<DocumentClassificationResult> {
  if (!options?.enabled || !options.tenantOptIn || !options.classifier) {
    return deterministic;
  }
  if (context.tenantId !== scheme.tenantId) {
    throw new Error("Boundary LLM tenant does not match classification scheme tenant");
  }

  let proposal: BoundaryLlmClassificationProposal;
  try {
    proposal = await options.classifier.classify({
      tenantId: context.tenantId,
      userId: context.userId,
      source,
      deterministicLevelId: deterministic.levelId,
      deterministicIndicatorIds: [...deterministic.triggeredIndicatorIds],
    });
  } catch {
    return deterministic;
  }

  // Model output is untrusted. An unknown/hallucinated level must never escape
  // the optional stage or break the deterministic #68 fallback path.
  if (!scheme.levels.some((level) => level.id === proposal.levelId)) {
    return deterministic;
  }

  const proposedRank = getClassificationLevelRank(scheme, proposal.levelId);
  const deterministicRank = getClassificationLevelRank(scheme, deterministic.levelId);
  if (proposedRank < deterministicRank) {
    return deterministic;
  }

  const rationale = proposal.rationale.trim();
  const reasons = rationale
    ? [...deterministic.reasons, `optionale LLM-Bewertung: ${rationale}`]
    : deterministic.reasons;

  if (proposedRank === deterministicRank) {
    return {
      ...deterministic,
      reasons,
    };
  }

  return {
    ...deterministic,
    levelId: proposal.levelId,
    reasons,
    aiDecisions: Object.fromEntries(
      scheme.aiPolicy.map((policy) => [
        policy.tool,
        isAiToolAllowed(scheme, policy.tool, proposal.levelId),
      ]),
    ),
  };
}
