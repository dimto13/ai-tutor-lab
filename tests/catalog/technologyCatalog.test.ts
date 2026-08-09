import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTechnologyCatalog,
  technologyCatalog,
  validateCatalogEnvironmentReference,
} from "../../src/catalog/index.ts";

test("technology catalog loads in Node without the frontend build", () => {
  assert.ok(technologyCatalog.providers.some(({ id }) => id === "ai-train-lab"));
  assert.ok(technologyCatalog.products.some(({ id }) => id === "vscode"));
  assert.ok(technologyCatalog.products.some(({ id }) => id === "github-copilot"));
  assert.ok(technologyCatalog.products.some(({ id }) => id === "claude-code"));
});

test("GitHub Copilot is modeled as an integration hosted by VS Code", () => {
  const integration = technologyCatalog.integrations.find(
    ({ productId }) => productId === "github-copilot",
  );
  const runtimeAdapter = technologyCatalog.runtimeAdapters.find(
    ({ id }) => id === "github-copilot-vscode-simulator",
  );

  assert.ok(integration);
  assert.equal(integration.hostProductId, "vscode");
  assert.ok(integration.capabilities.includes("chat"));
  assert.ok(integration.capabilities.includes("inline_completion"));
  assert.equal(runtimeAdapter?.integrationId, integration.id);
});

test("catalog rejects dangling product references", () => {
  assert.throws(() =>
    parseTechnologyCatalog({
      ...technologyCatalog,
      products: [
        ...technologyCatalog.products,
        {
          id: "broken-product",
          providerId: "missing-provider",
          technologyId: "ide",
          name: "Broken Product",
        },
      ],
    }),
  );
});

test("catalog rejects dangling integration hosts", () => {
  assert.throws(() =>
    parseTechnologyCatalog({
      ...technologyCatalog,
      integrations: [
        ...technologyCatalog.integrations,
        {
          id: "broken-integration",
          productId: "github-copilot",
          hostProductId: "missing-host",
          capabilities: ["chat"],
        },
      ],
    }),
  );
});

test("catalog rejects a product version using an adapter from another product", () => {
  assert.throws(() =>
    parseTechnologyCatalog({
      ...technologyCatalog,
      productVersions: technologyCatalog.productVersions.map((version) =>
        version.id === "vscode@1.x"
          ? {
              ...version,
              runtimeAdapterIds: ["github-copilot-vscode-simulator"],
            }
          : version,
      ),
    }),
  );
});

test("catalog rejects duplicate product/version tuples even with different ids", () => {
  assert.throws(() =>
    parseTechnologyCatalog({
      ...technologyCatalog,
      productVersions: [
        ...technologyCatalog.productVersions,
        {
          id: "vscode@duplicate",
          productId: "vscode",
          version: "1.x",
          capabilities: ["editor"],
        },
      ],
    }),
  );
});

test("catalog rejects unknown fields in nested records", () => {
  assert.throws(() =>
    parseTechnologyCatalog({
      ...technologyCatalog,
      productVersions: technologyCatalog.productVersions.map((version) =>
        version.id === "vscode@1.x"
          ? {
              ...version,
              runtimeAdaptrIds: ["vscode-simulator"],
            }
          : version,
      ),
    }),
  );
});

test("scenario environment reference accepts version-pinned integration runtimes", () => {
  assert.deepEqual(
    validateCatalogEnvironmentReference(technologyCatalog, {
      productId: "vscode",
      version: "1.x",
      runtimeAdapterId: "vscode-simulator",
      integrations: [
        {
          productId: "github-copilot",
          version: "2026.08",
          runtimeAdapterId: "github-copilot-vscode-simulator",
        },
      ],
    }),
    [],
  );
});

test("scenario environment reference rejects an unknown product version", () => {
  const issues = validateCatalogEnvironmentReference(technologyCatalog, {
    productId: "vscode",
    version: "999.x",
    runtimeAdapterId: "vscode-simulator",
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "environment.version");
  assert.match(issues[0]?.message ?? "", /vscode@999\.x/);
});

test("scenario environment reference rejects an adapter outside the selected product version", () => {
  const issues = validateCatalogEnvironmentReference(technologyCatalog, {
    productId: "vscode",
    version: "1.x",
    runtimeAdapterId: "github-copilot-vscode-simulator",
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "environment.runtimeAdapterId");
});

test("scenario environment reference rejects a hosted adapter in the primary runtime slot", () => {
  const issues = validateCatalogEnvironmentReference(technologyCatalog, {
    productId: "github-copilot",
    version: "2026.08",
    runtimeAdapterId: "github-copilot-vscode-simulator",
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "environment.runtimeAdapterId");
  assert.match(issues[0]?.message ?? "", /cannot be used as the primary runtime/);
});

test("scenario environment reference rejects an integration adapter bound to another host", () => {
  const alternateHostCatalog = parseTechnologyCatalog({
    ...technologyCatalog,
    integrations: [
      ...technologyCatalog.integrations,
      {
        id: "github-copilot-in-alternate-host",
        productId: "github-copilot",
        hostProductId: "claude-code",
        capabilities: ["chat"],
      },
    ],
    runtimeAdapters: [
      ...technologyCatalog.runtimeAdapters,
      {
        id: "github-copilot-alternate-host-simulator",
        productId: "github-copilot",
        integrationId: "github-copilot-in-alternate-host",
        kind: "simulator",
        capabilities: ["chat"],
      },
    ],
    productVersions: technologyCatalog.productVersions.map((version) =>
      version.id === "github-copilot@2026.08"
        ? {
            ...version,
            runtimeAdapterIds: [
              ...(version.runtimeAdapterIds ?? []),
              "github-copilot-alternate-host-simulator",
            ],
          }
        : version,
    ),
  });

  const issues = validateCatalogEnvironmentReference(alternateHostCatalog, {
    productId: "vscode",
    version: "1.x",
    runtimeAdapterId: "vscode-simulator",
    integrations: [
      {
        productId: "github-copilot",
        version: "2026.08",
        runtimeAdapterId: "github-copilot-alternate-host-simulator",
      },
    ],
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "environment.integrations[0].runtimeAdapterId");
});

test("scenario environment reference rejects an unknown integration product version", () => {
  const issues = validateCatalogEnvironmentReference(technologyCatalog, {
    productId: "vscode",
    version: "1.x",
    runtimeAdapterId: "vscode-simulator",
    integrations: [
      {
        productId: "github-copilot",
        version: "999.0",
        runtimeAdapterId: "github-copilot-vscode-simulator",
      },
    ],
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "environment.integrations[0].version");
});

test("scenario environment reference rejects an adapter reassigned to another integration version", () => {
  const reassignedCatalog = parseTechnologyCatalog({
    ...technologyCatalog,
    productVersions: [
      ...technologyCatalog.productVersions.map((version) =>
        version.id === "github-copilot@2026.08"
          ? {
              ...version,
              runtimeAdapterIds: [],
            }
          : version,
      ),
      {
        id: "github-copilot@2026.09",
        productId: "github-copilot",
        version: "2026.09",
        capabilities: ["chat", "inline_completion", "agent_mode"],
        runtimeAdapterIds: ["github-copilot-vscode-simulator"],
      },
    ],
  });

  const issues = validateCatalogEnvironmentReference(reassignedCatalog, {
    productId: "vscode",
    version: "1.x",
    runtimeAdapterId: "vscode-simulator",
    integrations: [
      {
        productId: "github-copilot",
        version: "2026.08",
        runtimeAdapterId: "github-copilot-vscode-simulator",
      },
    ],
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "environment.integrations[0].runtimeAdapterId");
  assert.match(issues[0]?.message ?? "", /not registered for github-copilot@2026\.08/);
});
