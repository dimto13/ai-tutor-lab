import assert from "node:assert/strict";
import { test } from "node:test";
import {
  artifactPreviewRuntime,
  createArtifactPreviewRuntime,
  type ArtifactPreviewState,
} from "../../src/runtime/artifactPreviewRuntime.ts";
import { defineRuntimeAdapterContractTests } from "./runtimeAdapter.contract.ts";

const targetRef = "artifact.preview.rendered";
const targetRect = {
  x: 30,
  y: 40,
  top: 40,
  right: 230,
  bottom: 160,
  left: 30,
  width: 200,
  height: 120,
  toJSON: () => ({}),
} as DOMRect;

function createContainer(): HTMLElement {
  const target = { getBoundingClientRect: () => targetRect };
  return {
    querySelector: (selector: string) =>
      selector === `[data-highlight="${targetRef}"]` ? target : null,
  } as unknown as HTMLElement;
}

const htmlArtifact = {
  id: "page",
  type: "html" as const,
  title: "Page",
  html: "<section><h1>Safe preview</h1><p>Initial</p></section>",
};

defineRuntimeAdapterContractTests("artifactPreviewRuntime", () => {
  let restoredState: ArtifactPreviewState | null = null;
  let unsubscribeState: (() => void) | null = null;

  return {
    adapter: artifactPreviewRuntime,
    reset: () => {
      unsubscribeState?.();
      unsubscribeState = null;
      restoredState = null;
      artifactPreviewRuntime.reset();
    },
    target: {
      ref: targetRef,
      container: createContainer(),
      expectedRect: targetRect,
    },
    event: {
      name: "artifact.created",
      emit: () => artifactPreviewRuntime.createArtifact(htmlArtifact),
    },
    query: {
      selector: "artifact.viewMode",
      expected: "preview",
    },
    seed: {
      seed: {
        artifactPreview: {
          artifacts: [
            {
              id: "table",
              type: "table",
              title: "Table",
              columns: [{ key: "value", label: "Value" }],
              rows: [{ value: 42 }],
            },
          ],
        },
      },
      selector: "artifact.active.type",
      expected: "table",
    },
    snapshot: {
      selector: "artifact.viewMode",
      expectedRestoredValue: "source",
      prepare: () => {
        artifactPreviewRuntime.createArtifact(htmlArtifact);
        artifactPreviewRuntime.setViewMode("source");
        unsubscribeState = artifactPreviewRuntime.subscribeState((state, reason) => {
          if (reason === "restore") restoredState = state;
        });
      },
      mutate: () => artifactPreviewRuntime.setViewMode("preview"),
      assertRestoredPresentation: () => {
        assert.ok(restoredState);
        assert.equal(restoredState.activeArtifactId, "page");
        assert.equal(restoredState.viewMode, "source");
        unsubscribeState?.();
        unsubscribeState = null;
      },
    },
  };
});

test("artifactPreviewRuntime: represents HTML, table and structured data and applies a deterministic revision", async () => {
  const runtime = createArtifactPreviewRuntime();
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => events.push(event.type));
  await runtime.mount(createContainer(), {
    artifactPreview: {
      artifacts: [
        htmlArtifact,
        {
          id: "table",
          type: "table",
          title: "Table",
          columns: [{ key: "amount", label: "Amount" }],
          rows: [{ amount: 10 }],
          formulas: { amount: "SUM(A1:A1)" },
        },
        {
          id: "data",
          type: "data",
          title: "Data",
          value: { verified: false, items: [1, 2, 3] },
        },
      ],
      revisions: [
        {
          id: "page-v2",
          artifactId: "page",
          label: "Update",
          next: {
            ...htmlArtifact,
            html: "<section><h1>Safe preview</h1><p>Updated</p></section>",
          },
        },
      ],
    },
  });

  try {
    assert.deepEqual(await runtime.query("artifact.items"), ["page", "table", "data"]);
    runtime.selectArtifact("table");
    assert.equal(await runtime.query("artifact.active.type"), "table");
    runtime.selectArtifact("data");
    assert.equal(await runtime.query("artifact.active.type"), "data");
    runtime.applyRevision("page-v2");
    assert.equal(await runtime.query("artifact.active.id"), "page");
    assert.equal(await runtime.query("artifact.current.revision"), "page-v2");
    assert.match((await runtime.query<{ html: string }>("artifact.current")).html, /Updated/);
    runtime.verifyActiveArtifact();
    assert.equal(await runtime.query("artifact.verified"), true);
    assert.ok(events.includes("artifact.updated"));
    assert.ok(events.includes("artifact.verified"));
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});

test("artifactPreviewRuntime: rejects unsafe HTML even when mounted directly outside the content loader", async () => {
  const runtime = createArtifactPreviewRuntime();
  await assert.rejects(
    () =>
      runtime.mount(createContainer(), {
        artifactPreview: {
          artifacts: [
            {
              id: "unsafe",
              type: "html",
              title: "Unsafe",
              html: "<script>parent.postMessage('executed', '*')</script>",
            },
          ],
        },
      }),
    /Tag <script> ist nicht erlaubt/,
  );
});

test("artifactPreviewRuntime: restores an empty snapshot for scenarios without seeded artifacts", async () => {
  const runtime = createArtifactPreviewRuntime();
  await runtime.mount(createContainer());
  try {
    const snapshot = await runtime.snapshot();
    runtime.createArtifact(htmlArtifact);
    assert.equal(await runtime.query("artifact.active.id"), "page");
    await runtime.restore(snapshot);
    assert.equal(await runtime.query("artifact.active.id"), null);
    assert.deepEqual(await runtime.query("artifact.items"), []);
  } finally {
    await runtime.unmount();
  }
});
