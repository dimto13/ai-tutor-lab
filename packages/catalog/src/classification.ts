import { z } from "zod";

const classificationIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, "must be a stable identifier");

export const classificationLevelSchema = z
  .object({
    id: classificationIdSchema,
    label: z.string().trim().min(1),
  })
  .strict();

export const classificationIndicatorSchema = z
  .object({
    id: classificationIdSchema,
    label: z.string().trim().min(1),
    minLevel: classificationIdSchema,
  })
  .strict();

export const aiToolPolicySchema = z
  .object({
    tool: classificationIdSchema,
    maxLevel: classificationIdSchema,
  })
  .strict();

export const classificationSchemeSchema = z
  .object({
    tenantId: classificationIdSchema,
    levels: z.array(classificationLevelSchema).min(1),
    indicators: z.array(classificationIndicatorSchema).min(1),
    aiPolicy: z.array(aiToolPolicySchema).min(1),
    defaultOnUncertainty: z.literal("escalate"),
  })
  .strict()
  .superRefine((scheme, ctx) => {
    const levelIds = new Set<string>();
    scheme.levels.forEach((level, index) => {
      if (levelIds.has(level.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate level id: ${level.id}`,
          path: ["levels", index, "id"],
        });
      }
      levelIds.add(level.id);
    });

    const indicatorIds = new Set<string>();
    scheme.indicators.forEach((indicator, index) => {
      if (indicatorIds.has(indicator.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate indicator id: ${indicator.id}`,
          path: ["indicators", index, "id"],
        });
      }
      indicatorIds.add(indicator.id);

      if (!levelIds.has(indicator.minLevel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown minLevel: ${indicator.minLevel}`,
          path: ["indicators", index, "minLevel"],
        });
      }
    });

    const tools = new Set<string>();
    scheme.aiPolicy.forEach((policy, index) => {
      if (tools.has(policy.tool)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate AI tool policy: ${policy.tool}`,
          path: ["aiPolicy", index, "tool"],
        });
      }
      tools.add(policy.tool);

      if (!levelIds.has(policy.maxLevel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown maxLevel: ${policy.maxLevel}`,
          path: ["aiPolicy", index, "maxLevel"],
        });
      }
    });
  });

export const classificationSchemeDocumentSchema = z
  .object({
    classificationScheme: classificationSchemeSchema,
  })
  .strict();

export type ClassificationLevel = z.infer<typeof classificationLevelSchema>;
export type ClassificationIndicator = z.infer<typeof classificationIndicatorSchema>;
export type AiToolPolicy = z.infer<typeof aiToolPolicySchema>;
export type ClassificationScheme = z.infer<typeof classificationSchemeSchema>;
export type ClassificationSchemeDocument = z.infer<typeof classificationSchemeDocumentSchema>;

export interface ClassificationDecision {
  levelId: string;
  triggeredIndicatorIds: string[];
  aiDecisions: Record<string, boolean>;
  requiresHumanReview: boolean;
}

export function parseClassificationScheme(raw: unknown): ClassificationScheme {
  return classificationSchemeSchema.parse(raw);
}

export function parseClassificationSchemeDocument(raw: unknown): ClassificationSchemeDocument {
  return classificationSchemeDocumentSchema.parse(raw);
}

/**
 * Classification schemes are stored as YAML 1.2 using its JSON-compatible subset.
 * This keeps authoring deterministic and dependency-free while remaining valid YAML.
 */
export function parseClassificationSchemeYaml(source: string): ClassificationSchemeDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Classification scheme YAML must use the JSON-compatible YAML 1.2 profile: ${detail}`,
    );
  }
  return parseClassificationSchemeDocument(raw);
}

export function getClassificationLevelRank(
  scheme: ClassificationScheme,
  levelId: string,
): number {
  const rank = scheme.levels.findIndex((level) => level.id === levelId);
  if (rank < 0) {
    throw new Error(`Unknown classification level: ${levelId}`);
  }
  return rank;
}

export function resolveHighestMinimumLevel(
  scheme: ClassificationScheme,
  indicatorIds: readonly string[],
): string {
  const indicatorsById = new Map(scheme.indicators.map((indicator) => [indicator.id, indicator]));
  let highestRank = 0;

  for (const indicatorId of new Set(indicatorIds)) {
    const indicator = indicatorsById.get(indicatorId);
    if (!indicator) {
      throw new Error(`Unknown classification indicator: ${indicatorId}`);
    }
    highestRank = Math.max(highestRank, getClassificationLevelRank(scheme, indicator.minLevel));
  }

  return scheme.levels[highestRank].id;
}

export function isAiToolAllowed(
  scheme: ClassificationScheme,
  tool: string,
  levelId: string,
): boolean {
  const levelRank = getClassificationLevelRank(scheme, levelId);
  const policy = scheme.aiPolicy.find((entry) => entry.tool === tool);
  if (!policy) return false;
  return levelRank <= getClassificationLevelRank(scheme, policy.maxLevel);
}

export function classifyByIndicators(
  scheme: ClassificationScheme,
  indicatorIds: readonly string[],
  options: { uncertain?: boolean } = {},
): ClassificationDecision {
  const triggeredIndicatorIds = [...new Set(indicatorIds)];
  const baseLevelId = resolveHighestMinimumLevel(scheme, triggeredIndicatorIds);
  const baseRank = getClassificationLevelRank(scheme, baseLevelId);
  const uncertain = options.uncertain === true;
  const resolvedRank = uncertain
    ? Math.min(baseRank + 1, scheme.levels.length - 1)
    : baseRank;
  const levelId = scheme.levels[resolvedRank].id;

  return {
    levelId,
    triggeredIndicatorIds,
    aiDecisions: Object.fromEntries(
      scheme.aiPolicy.map((policy) => [policy.tool, isAiToolAllowed(scheme, policy.tool, levelId)]),
    ),
    requiresHumanReview: uncertain,
  };
}
