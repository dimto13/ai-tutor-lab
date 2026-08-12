import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSandboxedArtifactDocument } from "../../apps/web/src/runtime/artifactPreviewContent.ts";
import { createArtifactPreviewRuntime } from "../../apps/web/src/runtime/artifactPreviewRuntime.ts";

function createContainer(): HTMLElement {
  return {
    querySelector: () => null,
  } as unknown as HTMLElement;
}

const safePage = {
  id: "team-page",
  type: "html" as const,
  title: "Team page",
  html: '<main><h1>Team</h1><p><a href="#">Zum Seitenanfang</a></p></main>',
};

test("artifactPreview sandbox regression: keeps fragment links inside the srcdoc document", () => {
  const document = buildSandboxedArtifactDocument(safePage.html);
  assert.match(document, /<base href="about:srcdoc">/);
  assert.match(document, /href="#"/);
  assert.doesNotMatch(document, /<script/i);
});

test("artifactPreview sandbox regression: keeps native internal links but rejects script in revisions", async () => {
  const runtime = createArtifactPreviewRuntime();

  await assert.rejects(
    () =>
      runtime.mount(createContainer(), {
        artifactPreview: {
          artifacts: [safePage],
          revisions: [
            {
              id: "unsafe-next",
              artifactId: "team-page",
              label: "Unsafe",
              next: {
                ...safePage,
                html: "<main><script>parent.postMessage('executed', '*')</script></main>",
              },
            },
          ],
        },
      }),
    /Tag <script> ist nicht erlaubt/,
  );

  await runtime.mount(createContainer(), {
    artifactPreview: {
      artifacts: [safePage],
      revisions: [
        {
          id: "safe-next",
          artifactId: "team-page",
          label: "Safe",
          next: {
            ...safePage,
            html: '<main><h1>Team</h1><p><a href="#">Zum Seitenanfang</a></p><table><tbody><tr><td>Nora Berger</td></tr></tbody></table></main>',
          },
        },
      ],
    },
  });

  try {
    runtime.applyRevision("safe-next");
    const current = await runtime.query<{ html: string }>("artifact.current");
    assert.match(current.html, /href="#"/);
    assert.match(current.html, /Nora Berger/);
    assert.doesNotMatch(current.html, /<script/i);
  } finally {
    await runtime.unmount();
  }
});
