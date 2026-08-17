import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  parseClassificationScheme,
  parseClassificationSchemeYaml,
  parseSyntheticDocumentCorpus,
} from "@ai-train-lab/catalog";
import {
  classificationRuntime,
  createClassificationRuntime,
  type ClassificationSimulatorState,
} from "../../apps/web/src/runtime/classificationRuntime.ts";
import { defineRuntimeAdapterContractTests } from "./runtimeAdapter.contract.ts";

const targetRef = "classification.document.preview";
const targetRect = {
  x: 20,
  y: 30,
  top: 30,
  right: 260,
  bottom: 190,
  left: 20,
  width: 240,
  height: 160,
  toJSON: () => ({}),
} as DOMRect;

function createContainer(): HTMLElement {
  const target = { getBoundingClientRect: () => targetRect };
  return {
    querySelector: (selector: string) =>
      selector === `[data-highlight="${targetRef}"]` ? target : null,
  } as unknown as HTMLElement;
}

const testScheme = parseClassificationScheme({
  tenantId: "runtime-test",
  levels: [
    { id: "public", label: "Public", rank: 0 },
    { id: "internal", label: "Internal", rank: 10 },
  ],
  indicators: [{ id: "internal_marker", label: "Internal marker", minLevel: "internal" }],
  aiPolicy: [{ tool: "approved-ai", maxLevel: "internal" }],
  defaultOnUncertainty: "escalate",
});

const testDocument = {
  id: "runtime-document",
  title: "Runtime document",
  documentType: "note",
  synthetic: true as const,
  content: "[SYNTHETIC] Runtime-only contract fixture",
  features: [
    {
      description: "Internal marker",
      evidence: "INTERNAL",
      indicatorId: "internal_marker",
    },
  ],
  expected: {
    indicatorIds: ["internal_marker"],
    uncertain: false,
    levelId: "internal",
    aiDecisions: { "approved-ai": true },
    requiresHumanReview: false,
  },
};

const runtimeSeed = {
  classificationSimulator: {
    scheme: testScheme,
    documents: [testDocument],
    activeDocumentId: testDocument.id,
    aiTool: "approved-ai",
  },
};

defineRuntimeAdapterContractTests("classificationRuntime", () => {
  let restoredState: ClassificationSimulatorState | null = null;
  let unsubscribeState: (() => void) | null = null;

  return {
    adapter: classificationRuntime,
    reset: () => {
      unsubscribeState?.();
      unsubscribeState = null;
      restoredState = null;
      classificationRuntime.reset();
    },
    target: {
      ref: targetRef,
      container: createContainer(),
      expectedRect: targetRect,
    },
    event: {
      name: "ui.element.inspected",
      emit: () => classificationRuntime.inspect(targetRef),
    },
    query: {
      selector: "classification.document.viewedIds",
      expected: [],
    },
    seed: {
      seed: runtimeSeed,
      selector: "classification.document.id",
      expected: testDocument.id,
    },
    snapshot: {
      selector: "classification.level.selected",
      expectedRestoredValue: "internal",
      prepare: () => {
        classificationRuntime.viewDocument(testDocument.id);
        classificationRuntime.markIndicator("internal_marker");
        classificationRuntime.selectLevel("internal");
        classificationRuntime.setAiDecision("approved-ai", true);
        unsubscribeState = classificationRuntime.subscribeState((state, reason) => {
          if (reason === "restore") restoredState = state;
        });
      },
      mutate: () => classificationRuntime.selectLevel("public"),
      assertRestoredPresentation: () => {
        assert.ok(restoredState);
        assert.equal(restoredState.selectedLevelId, "internal");
        assert.deepEqual(restoredState.markedIndicatorIds, ["internal_marker"]);
        assert.equal(restoredState.aiDecisions["approved-ai"], true);
        unsubscribeState?.();
        unsubscribeState = null;
      },
    },
  };
});

test("classificationRuntime: emits semantic document, indicator, level and AI-decision events without document content", async () => {
  const runtime = createClassificationRuntime();
  const events: Array<{ type: string; payload: unknown }> = [];
  const unsubscribe = runtime.subscribe((event) =>
    events.push({ type: event.type, payload: event.payload }),
  );
  await runtime.mount(createContainer(), runtimeSeed);

  try {
    runtime.viewDocument(testDocument.id);
    runtime.markIndicator("internal_marker");
    runtime.selectLevel("internal");
    runtime.setAiDecision("approved-ai", true);

    assert.deepEqual(
      events.map((event) => event.type),
      ["document.viewed", "indicator.marked", "level.selected", "ai.use.decided"],
    );
    assert.deepEqual(await runtime.query("classification.indicators.marked"), ["internal_marker"]);
    assert.equal(await runtime.query("classification.level.selected"), "internal");
    assert.equal(await runtime.query("classification.ai.decision"), true);
    assert.equal(await runtime.query("classification.ai.policyAllowed"), true);

    for (const event of events) {
      const serialized = JSON.stringify(event.payload);
      assert.doesNotMatch(serialized, /Runtime-only contract fixture/);
      assert.doesNotMatch(serialized, /INTERNAL/);
    }
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});

test("classificationRuntime: loads the existing declarative scheme and synthetic corpus as runtime seed", async () => {
  const schemeUrl = new URL(
    "../../content/classification/default-classification-scheme.yaml",
    import.meta.url,
  );
  const corpusUrl = new URL(
    "../../content/classification/synthetic-document-corpus.de.json",
    import.meta.url,
  );
  const scheme = parseClassificationSchemeYaml(
    await readFile(schemeUrl, "utf8"),
  ).classificationScheme;
  const corpus = parseSyntheticDocumentCorpus(JSON.parse(await readFile(corpusUrl, "utf8")));
  const document = corpus.corpus.documents.find((entry) => entry.id === "internal-meeting-note");
  assert.ok(document);

  const runtime = createClassificationRuntime();
  await runtime.mount(createContainer(), {
    classificationSimulator: {
      scheme,
      documents: corpus.corpus.documents,
      activeDocumentId: document.id,
      aiTool: "github-copilot",
    },
  });

  try {
    const current = await runtime.query<{ id: string; title: string; content: string }>(
      "classification.document.current",
    );
    assert.equal(current.id, document.id);
    assert.equal(current.title, document.title);
    assert.equal(current.content, document.content);
    assert.equal(await runtime.query("classification.ai.tool"), "github-copilot");
  } finally {
    await runtime.unmount();
  }
});

test("classificationRuntime: browser content composition references declarative files instead of embedding classification data in the adapter", async () => {
  const contentLoaderUrl = new URL(
    "../../apps/web/src/runtime/classificationRuntimeContent.ts",
    import.meta.url,
  );
  const runtimeUrl = new URL(
    "../../apps/web/src/runtime/classificationRuntime.ts",
    import.meta.url,
  );
  const [contentLoader, runtimeSource] = await Promise.all([
    readFile(contentLoaderUrl, "utf8"),
    readFile(runtimeUrl, "utf8"),
  ]);

  assert.match(contentLoader, /content\/classification\/synthetic-document-corpus\.de\.json/);
  assert.match(contentLoader, /content\/classification\/default-classification-scheme\.yaml\?raw/);
  assert.doesNotMatch(
    runtimeSource,
    /Pressemitteilung Produktstart|Personenbezogene Daten|Gehalts-/,
  );
});
