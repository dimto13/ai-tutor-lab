import type { TechnologyCatalog } from "./types.ts";

export interface CatalogIntegrationReference {
  productId: string;
  version: string;
  runtimeAdapterId: string;
}

export interface CatalogEnvironmentReference {
  productId: string;
  version: string;
  runtimeAdapterId: string;
  integrations?: CatalogIntegrationReference[];
}

export interface CatalogEnvironmentValidationIssue {
  path: string;
  message: string;
}

export function validateCatalogEnvironmentReference(
  catalog: TechnologyCatalog,
  environment: CatalogEnvironmentReference,
): CatalogEnvironmentValidationIssue[] {
  const issues: CatalogEnvironmentValidationIssue[] = [];
  const product = catalog.products.find(({ id }) => id === environment.productId);

  if (!product) {
    issues.push({
      path: "environment.productId",
      message: `unknown catalog product: ${environment.productId}`,
    });
    return issues;
  }

  const productVersion = catalog.productVersions.find(
    ({ productId, version }) =>
      productId === environment.productId && version === environment.version,
  );

  if (!productVersion) {
    issues.push({
      path: "environment.version",
      message: `unknown catalog product version: ${environment.productId}@${environment.version}`,
    });
    return issues;
  }

  const primaryRuntime = catalog.runtimeAdapters.find(
    ({ id }) => id === environment.runtimeAdapterId,
  );
  if (!productVersion.runtimeAdapterIds?.includes(environment.runtimeAdapterId)) {
    issues.push({
      path: "environment.runtimeAdapterId",
      message: `runtime adapter ${environment.runtimeAdapterId} is not registered for ${environment.productId}@${environment.version}`,
    });
  } else if (primaryRuntime?.integrationId) {
    issues.push({
      path: "environment.runtimeAdapterId",
      message: `hosted integration runtime adapter ${environment.runtimeAdapterId} cannot be used as the primary runtime`,
    });
  }

  for (const [index, integrationReference] of (environment.integrations ?? []).entries()) {
    const path = `environment.integrations[${index}]`;
    const integrationRuntime = catalog.runtimeAdapters.find(
      ({ id }) => id === integrationReference.runtimeAdapterId,
    );
    if (!integrationRuntime) {
      issues.push({
        path: `${path}.runtimeAdapterId`,
        message: `unknown catalog integration runtime adapter: ${integrationReference.runtimeAdapterId}`,
      });
      continue;
    }

    if (integrationRuntime.productId !== integrationReference.productId) {
      issues.push({
        path: `${path}.productId`,
        message: `runtime adapter ${integrationReference.runtimeAdapterId} belongs to product ${integrationRuntime.productId}, not ${integrationReference.productId}`,
      });
      continue;
    }

    if (!integrationRuntime.integrationId) {
      issues.push({
        path: `${path}.runtimeAdapterId`,
        message: `runtime adapter ${integrationReference.runtimeAdapterId} is not bound to a catalog integration`,
      });
      continue;
    }

    const integration = catalog.integrations.find(
      ({ id }) => id === integrationRuntime.integrationId,
    );
    if (!integration || integration.hostProductId !== environment.productId) {
      issues.push({
        path: `${path}.runtimeAdapterId`,
        message: `runtime adapter ${integrationReference.runtimeAdapterId} is not cataloged for host ${environment.productId}`,
      });
      continue;
    }

    const integrationVersion = catalog.productVersions.find(
      ({ productId, version }) =>
        productId === integrationReference.productId && version === integrationReference.version,
    );
    if (!integrationVersion) {
      issues.push({
        path: `${path}.version`,
        message: `unknown catalog integration product version: ${integrationReference.productId}@${integrationReference.version}`,
      });
      continue;
    }

    if (!integrationVersion.runtimeAdapterIds?.includes(integrationReference.runtimeAdapterId)) {
      issues.push({
        path: `${path}.runtimeAdapterId`,
        message: `runtime adapter ${integrationReference.runtimeAdapterId} is not registered for ${integrationReference.productId}@${integrationReference.version}`,
      });
    }
  }

  return issues;
}
