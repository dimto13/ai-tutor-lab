import { z } from "zod";
import type { TechnologyCatalog } from "./types.ts";

export const technologyIdSchema = z.enum([
  "ide",
  "source_control",
  "terminal",
  "ai_coding_assistant",
  "cli_agent",
  "office_assistant",
  "ai_chat",
  "artifact_preview",
  "document_classification",
]);

export const capabilitySchema = z.enum([
  "filesystem",
  "editor",
  "terminal",
  "extensions",
  "source_control",
  "chat",
  "inline_completion",
  "agent_mode",
  "artifact_preview",
]);

const technologySchema = z
  .object({
    id: technologyIdSchema,
    name: z.string().trim().min(1),
  })
  .strict();

const providerSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
  })
  .strict();

const productSchema = z
  .object({
    id: z.string().trim().min(1),
    providerId: z.string().trim().min(1),
    technologyId: technologyIdSchema,
    name: z.string().trim().min(1),
    hostProductId: z.string().trim().min(1).optional(),
  })
  .strict();

const productVersionSchema = z
  .object({
    id: z.string().trim().min(1),
    productId: z.string().trim().min(1),
    version: z.string().trim().min(1),
    capabilities: z.array(capabilitySchema),
    runtimeAdapterIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

const integrationSchema = z
  .object({
    id: z.string().trim().min(1),
    productId: z.string().trim().min(1),
    hostProductId: z.string().trim().min(1),
    capabilities: z.array(capabilitySchema).min(1),
  })
  .strict();

const runtimeAdapterSchema = z
  .object({
    id: z.string().trim().min(1),
    productId: z.string().trim().min(1),
    integrationId: z.string().trim().min(1).optional(),
    kind: z.enum(["simulator", "real"]),
    capabilities: z.array(capabilitySchema).min(1),
  })
  .strict();

function addDuplicateIssues(
  values: Array<{ id: string }>,
  path: string,
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    if (ids.has(value.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate id: ${value.id}`,
        path: [path, index, "id"],
      });
    }
    ids.add(value.id);
  });
}

export const technologyCatalogSchema = z
  .object({
    technologies: z.array(technologySchema).min(1),
    providers: z.array(providerSchema).min(1),
    products: z.array(productSchema).min(1),
    productVersions: z.array(productVersionSchema).min(1),
    integrations: z.array(integrationSchema),
    runtimeAdapters: z.array(runtimeAdapterSchema),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    addDuplicateIssues(catalog.technologies, "technologies", ctx);
    addDuplicateIssues(catalog.providers, "providers", ctx);
    addDuplicateIssues(catalog.products, "products", ctx);
    addDuplicateIssues(catalog.productVersions, "productVersions", ctx);
    addDuplicateIssues(catalog.integrations, "integrations", ctx);
    addDuplicateIssues(catalog.runtimeAdapters, "runtimeAdapters", ctx);

    const technologyIds = new Set(catalog.technologies.map(({ id }) => id));
    const providerIds = new Set(catalog.providers.map(({ id }) => id));
    const productIds = new Set(catalog.products.map(({ id }) => id));
    const integrationsById = new Map(
      catalog.integrations.map((integration) => [integration.id, integration]),
    );
    const runtimeAdaptersById = new Map(
      catalog.runtimeAdapters.map((runtimeAdapter) => [runtimeAdapter.id, runtimeAdapter]),
    );
    const productVersionKeys = new Set<string>();

    catalog.products.forEach((product, index) => {
      if (!providerIds.has(product.providerId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown providerId: ${product.providerId}`,
          path: ["products", index, "providerId"],
        });
      }
      if (!technologyIds.has(product.technologyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown technologyId: ${product.technologyId}`,
          path: ["products", index, "technologyId"],
        });
      }
      if (product.hostProductId && !productIds.has(product.hostProductId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown hostProductId: ${product.hostProductId}`,
          path: ["products", index, "hostProductId"],
        });
      }
    });

    catalog.productVersions.forEach((version, index) => {
      const versionKey = `${version.productId}\u0000${version.version}`;
      if (productVersionKeys.has(versionKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate product/version tuple: ${version.productId}@${version.version}`,
          path: ["productVersions", index],
        });
      }
      productVersionKeys.add(versionKey);

      if (!productIds.has(version.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown productId: ${version.productId}`,
          path: ["productVersions", index, "productId"],
        });
      }
      version.runtimeAdapterIds?.forEach((runtimeAdapterId, runtimeIndex) => {
        const runtimeAdapter = runtimeAdaptersById.get(runtimeAdapterId);
        if (!runtimeAdapter) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `unknown runtimeAdapterId: ${runtimeAdapterId}`,
            path: ["productVersions", index, "runtimeAdapterIds", runtimeIndex],
          });
          return;
        }
        if (runtimeAdapter.productId !== version.productId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `runtimeAdapterId ${runtimeAdapterId} belongs to product ${runtimeAdapter.productId}, not ${version.productId}`,
            path: ["productVersions", index, "runtimeAdapterIds", runtimeIndex],
          });
        }
      });
    });

    catalog.integrations.forEach((integration, index) => {
      if (!productIds.has(integration.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown productId: ${integration.productId}`,
          path: ["integrations", index, "productId"],
        });
      }
      if (!productIds.has(integration.hostProductId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown hostProductId: ${integration.hostProductId}`,
          path: ["integrations", index, "hostProductId"],
        });
      }
      if (integration.productId === integration.hostProductId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "integration productId and hostProductId must differ",
          path: ["integrations", index],
        });
      }
    });

    catalog.runtimeAdapters.forEach((runtimeAdapter, index) => {
      if (!productIds.has(runtimeAdapter.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown productId: ${runtimeAdapter.productId}`,
          path: ["runtimeAdapters", index, "productId"],
        });
      }

      if (runtimeAdapter.integrationId) {
        const integration = integrationsById.get(runtimeAdapter.integrationId);
        if (!integration) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `unknown integrationId: ${runtimeAdapter.integrationId}`,
            path: ["runtimeAdapters", index, "integrationId"],
          });
        } else if (integration.productId !== runtimeAdapter.productId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `integration ${runtimeAdapter.integrationId} belongs to product ${integration.productId}, not ${runtimeAdapter.productId}`,
            path: ["runtimeAdapters", index, "integrationId"],
          });
        }
      }
    });
  });

export function parseTechnologyCatalog(raw: unknown): TechnologyCatalog {
  return technologyCatalogSchema.parse(raw) as TechnologyCatalog;
}
