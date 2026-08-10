import assert from "node:assert/strict";
import { test } from "node:test";
import {
  artifactPreviewSeedSchema,
  buildSandboxedArtifactDocument,
  validateArtifactHtml,
} from "../../apps/web/src/runtime/artifactPreviewContent.ts";

test("artifact preview content: accepts the conservative HTML allow-list", () => {
  const html =
    '<section aria-label="Status"><h1>Übersicht</h1><table><thead><tr><th scope="col">Team</th></tr></thead><tbody><tr><td>Nord</td></tr></tbody></table><a href="#source">Quelle</a></section>';
  assert.deepEqual(validateArtifactHtml(html), []);
  assert.equal(
    artifactPreviewSeedSchema.safeParse({
      artifacts: [{ id: "safe", type: "html", title: "Safe", html }],
    }).success,
    true,
  );
});

test("artifact preview content: rejects executable tags, event handlers and unsafe URLs", () => {
  for (const html of [
    "<script>alert(1)</script>",
    '<section onload="alert(1)"><p>Unsafe</p></section>',
    '<a href="javascript:alert(1)">Unsafe</a>',
    '<a href="https://example.com">External network</a>',
    '<iframe src="https://example.com"></iframe>',
  ]) {
    const result = artifactPreviewSeedSchema.safeParse({
      artifacts: [{ id: "unsafe", type: "html", title: "Unsafe", html }],
    });
    assert.equal(result.success, false, html);
  }
});

test("artifact preview content: rejects malformed tables and revision references", () => {
  assert.equal(
    artifactPreviewSeedSchema.safeParse({
      artifacts: [
        {
          id: "table",
          type: "table",
          title: "Table",
          columns: [{ key: "known", label: "Known" }],
          rows: [{ unknown: 1 }],
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    artifactPreviewSeedSchema.safeParse({
      artifacts: [{ id: "data", type: "data", title: "Data", value: {} }],
      revisions: [
        {
          id: "other-v2",
          artifactId: "other",
          label: "Update",
          next: { id: "other", type: "data", title: "Other", value: {} },
        },
      ],
    }).success,
    false,
  );
});

test("artifact preview content: sandbox document adds presentation only and keeps the body unchanged", () => {
  const body = "<section><h1>Preview</h1></section>";
  const document = buildSandboxedArtifactDocument(body);
  assert.match(document, /<!doctype html>/);
  assert.match(document, /<style>/);
  assert.ok(document.endsWith(`${body}</body></html>`));
  assert.doesNotMatch(document, /allow-scripts|allow-same-origin/);
});
