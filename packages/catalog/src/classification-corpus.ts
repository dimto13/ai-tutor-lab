import { z } from "zod";

const corpusIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "must be a stable identifier");

export const syntheticDocumentFeatureSchema = z
  .object({
    description: z.string().trim().min(1),
    evidence: z.string().trim().min(1),
    indicatorId: corpusIdSchema.optional(),
  })
  .strict();

export const syntheticDocumentExpectedSchema = z
  .object({
    indicatorIds: z.array(corpusIdSchema),
    uncertain: z.boolean(),
    levelId: corpusIdSchema,
    aiDecisions: z.record(z.string().min(1), z.boolean()),
    requiresHumanReview: z.boolean(),
  })
  .strict();

export const syntheticDocumentSchema = z
  .object({
    id: corpusIdSchema,
    title: z.string().trim().min(1),
    documentType: corpusIdSchema,
    synthetic: z.literal(true),
    content: z.string().min(1),
    features: z.array(syntheticDocumentFeatureSchema).min(1),
    expected: syntheticDocumentExpectedSchema,
    boundaryCase: z
      .object({
        rationale: z.string().trim().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const syntheticDocumentCorpusSchema = z
  .object({
    corpus: z
      .object({
        id: corpusIdSchema,
        locale: z.string().trim().min(1),
        allEntitiesAndNumbersFictional: z.literal(true),
        syntheticMarker: z.string().trim().min(1),
        documents: z.array(syntheticDocumentSchema).min(20),
      })
      .strict(),
  })
  .strict()
  .superRefine((document, ctx) => {
    const ids = new Set<string>();
    let boundaryCases = 0;

    document.corpus.documents.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate synthetic document id: ${entry.id}`,
          path: ["corpus", "documents", index, "id"],
        });
      }
      ids.add(entry.id);

      if (!entry.content.startsWith(document.corpus.syntheticMarker)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "synthetic marker must prefix document content",
          path: ["corpus", "documents", index, "content"],
        });
      }

      if (entry.boundaryCase) boundaryCases += 1;
    });

    if (boundaryCases < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "synthetic corpus must contain at least five boundary cases",
        path: ["corpus", "documents"],
      });
    }
  });

export type SyntheticDocumentFeature = z.infer<typeof syntheticDocumentFeatureSchema>;
export type SyntheticDocumentExpected = z.infer<typeof syntheticDocumentExpectedSchema>;
export type SyntheticDocument = z.infer<typeof syntheticDocumentSchema>;
export type SyntheticDocumentCorpus = z.infer<typeof syntheticDocumentCorpusSchema>;

export function parseSyntheticDocumentCorpus(raw: unknown): SyntheticDocumentCorpus {
  return syntheticDocumentCorpusSchema.parse(raw);
}
