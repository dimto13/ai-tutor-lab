import assert from "node:assert/strict";
import test from "node:test";
import { parseClassificationScheme } from "@ai-train-lab/catalog";
import { createClassificationRuntime } from "../../apps/web/src/runtime/classificationRuntime.ts";

const scheme = parseClassificationScheme({
  tenantId: "classification-learning-test",
  levels: [
    { id: "public", label: "Öffentlich", rank: 0 },
    { id: "confidential", label: "Vertraulich", rank: 20 },
  ],
  indicators: [{ id: "personal_data", label: "Personenbezogene Daten", minLevel: "confidential" }],
  aiPolicy: [
    { tool: "tenant-ai", maxLevel: "confidential" },
    { tool: "public-ai", maxLevel: "public" },
  ],
  defaultOnUncertainty: "escalate",
});

const confidentialDocument = {
  id: "confidential-doc",
  title: "Synthetisches Kontaktdokument",
  documentType: "support_ticket",
  synthetic: true as const,
  content: "[SYNTHETISCH] Alex Beispiel, alex@example.invalid",
  features: [
    {
      description: "Fiktive Kontaktdaten",
      evidence: "Alex Beispiel",
      indicatorId: "personal_data",
    },
  ],
  expected: {
    indicatorIds: ["personal_data"],
    uncertain: false,
    levelId: "confidential",
    aiDecisions: { "tenant-ai": true, "public-ai": false },
    requiresHumanReview: false,
  },
};

const publicDocument = {
  id: "public-doc",
  title: "Synthetische Veröffentlichung",
  documentType: "press_release",
  synthetic: true as const,
  content: "[SYNTHETISCH] Freigegebene öffentliche Information",
  features: [{ description: "Öffentlich", evidence: "freigegeben" }],
  expected: {
    indicatorIds: [],
    uncertain: false,
    levelId: "public",
    aiDecisions: { "tenant-ai": true, "public-ai": true },
    requiresHumanReview: false,
  },
};

function container(): HTMLElement {
  return { querySelector: () => null } as unknown as HTMLElement;
}

test("classification learning runtime retains independent end states across document order and snapshot restore", async () => {
  const runtime = createClassificationRuntime();
  await runtime.mount(container(), {
    classificationSimulator: {
      scheme,
      documents: [confidentialDocument, publicDocument],
      activeDocumentId: confidentialDocument.id,
      aiTool: "tenant-ai",
    },
  });

  try {
    runtime.viewDocument(confidentialDocument.id);
    runtime.markIndicator("personal_data");
    runtime.selectLevel("confidential");
    runtime.setAiDecision("tenant-ai", true);
    runtime.selectAiTool("public-ai");
    runtime.setAiDecision("public-ai", false);

    runtime.viewDocument(publicDocument.id);
    runtime.selectLevel("public");
    runtime.setAiDecision("tenant-ai", true);
    runtime.selectAiTool("public-ai");
    runtime.setAiDecision("public-ai", true);

    runtime.viewDocument(confidentialDocument.id);
    assert.deepEqual(await runtime.query("classification.indicators.marked"), ["personal_data"]);
    assert.equal(await runtime.query("classification.level.selected"), "confidential");
    assert.deepEqual(await runtime.query("classification.ai.decisions"), {
      "tenant-ai": true,
      "public-ai": false,
    });

    const validationState = await runtime.query<Record<string, unknown>>(
      "classification.validation.state",
    );
    const serializedValidationState = JSON.stringify(validationState);
    assert.doesNotMatch(
      serializedValidationState,
      /Alex Beispiel|Freigegebene öffentliche Information/,
    );
    assert.deepEqual(validationState["viewedDocumentIds"], ["confidential-doc", "public-doc"]);

    const snapshot = await runtime.snapshot();
    runtime.selectLevel("public");
    await runtime.restore(snapshot);

    const progress = await runtime.query<
      Record<string, { selectedLevelId: string | null; aiDecisions: Record<string, boolean> }>
    >("classification.documents.progress");
    assert.equal(progress["confidential-doc"]?.selectedLevelId, "confidential");
    assert.equal(progress["public-doc"]?.selectedLevelId, "public");
    assert.equal(progress["confidential-doc"]?.aiDecisions["public-ai"], false);
    assert.equal(progress["public-doc"]?.aiDecisions["public-ai"], true);
  } finally {
    await runtime.unmount();
  }
});
