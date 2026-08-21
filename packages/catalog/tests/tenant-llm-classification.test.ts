import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClassificationScheme } from "../src/classification.ts";
import type { DocumentClassificationResult } from "../src/document-classification.ts";
import { applyBoundaryLlmClassification } from "../src/tenant-llm-classification.ts";

const scheme: ClassificationScheme = {
  tenantId: "tenant-a",
  levels: [
    { id: "public", label: "Öffentlich", rank: 0 },
    { id: "internal", label: "Intern", rank: 1 },
    { id: "confidential", label: "Vertraulich", rank: 2 },
  ],
  indicators: [{ id: "marking_internal", label: "Intern", minLevel: "internal" }],
  aiPolicy: [
    { tool: "internal-ai", maxLevel: "confidential" },
    { tool: "external-ai", maxLevel: "internal" },
  ],
  defaultOnUncertainty: "escalate",
};

const deterministic: DocumentClassificationResult = {
  levelId: "internal",
  triggeredIndicatorIds: ["marking_internal"],
  aiDecisions: { "internal-ai": true, "external-ai": true },
  requiresHumanReview: false,
  uncertain: false,
  reasons: ["explizite interne Kennzeichnung erkannt"],
};

const context = { tenantId: "tenant-a", userId: "user-a" };
const source = { format: "txt" as const, bytes: new TextEncoder().encode("INTERN: Projekt A") };

describe("applyBoundaryLlmClassification", () => {
  it("keeps deterministic classification fully functional without a configured model", async () => {
    assert.equal(
      await applyBoundaryLlmClassification(scheme, context, source, deterministic),
      deterministic,
    );
  });

  it("does not call the model unless both feature flag and tenant opt-in are enabled", async () => {
    let calls = 0;
    const classifier = {
      classify() {
        calls += 1;
        return { levelId: "confidential", rationale: "Kontextsignal" };
      },
    };

    const disabled = await applyBoundaryLlmClassification(scheme, context, source, deterministic, {
      enabled: false,
      tenantOptIn: true,
      classifier,
    });
    const noOptIn = await applyBoundaryLlmClassification(scheme, context, source, deterministic, {
      enabled: true,
      tenantOptIn: false,
      classifier,
    });

    assert.equal(disabled, deterministic);
    assert.equal(noOptIn, deterministic);
    assert.equal(calls, 0);
  });

  it("can confirm or raise a level but never lower the deterministic result", async () => {
    const lower = await applyBoundaryLlmClassification(scheme, context, source, deterministic, {
      enabled: true,
      tenantOptIn: true,
      classifier: {
        classify: () => ({ levelId: "public", rationale: "zu niedrig" }),
      },
    });
    assert.equal(lower, deterministic);

    const confirmed = await applyBoundaryLlmClassification(scheme, context, source, deterministic, {
      enabled: true,
      tenantOptIn: true,
      classifier: {
        classify: () => ({ levelId: "internal", rationale: "Kontext bestätigt intern" }),
      },
    });
    assert.equal(confirmed.levelId, "internal");
    assert.match(confirmed.reasons.join(" "), /Kontext bestätigt intern/);

    const raised = await applyBoundaryLlmClassification(scheme, context, source, deterministic, {
      enabled: true,
      tenantOptIn: true,
      classifier: {
        classify: () => ({ levelId: "confidential", rationale: "vertraulicher Vertragskontext" }),
      },
    });
    assert.equal(raised.levelId, "confidential");
    assert.deepEqual(raised.aiDecisions, { "internal-ai": true, "external-ai": false });
    assert.match(raised.reasons.join(" "), /vertraulicher Vertragskontext/);
  });

  it("falls back to the deterministic result when the optional model is unavailable", async () => {
    const result = await applyBoundaryLlmClassification(scheme, context, source, deterministic, {
      enabled: true,
      tenantOptIn: true,
      classifier: {
        classify() {
          throw new Error("provider unavailable");
        },
      },
    });

    assert.equal(result, deterministic);
  });

  it("fails closed when tenant context and classification boundary disagree", async () => {
    await assert.rejects(
      applyBoundaryLlmClassification(
        scheme,
        { tenantId: "tenant-b", userId: "user-b" },
        source,
        deterministic,
        {
          enabled: true,
          tenantOptIn: true,
          classifier: {
            classify: () => ({ levelId: "confidential", rationale: "irrelevant" }),
          },
        },
      ),
      /tenant does not match/,
    );
  });
});
