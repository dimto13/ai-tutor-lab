import assert from "node:assert/strict";
import test from "node:test";
import { createCopilotRuntime } from "../../src/runtime/copilotRuntime.ts";
import { resolveCopilotProductProfile } from "../../src/runtime/copilotProductProfile.ts";

test("Copilot runtime can be configured from the version-pinned integration profile", () => {
  const runtime = createCopilotRuntime();
  const profile = resolveCopilotProductProfile({
    productId: "github-copilot",
    hostProductId: "vscode",
    version: "2026.08",
  });

  runtime.configureProductProfile(profile);

  assert.equal(runtime.getProductProfile().productVersion, "2026.08");
  assert.equal(runtime.getProductProfile().id, profile.id);
});

test("Copilot profile resolver rejects an unsupported pinned version", () => {
  assert.throws(
    () =>
      resolveCopilotProductProfile({
        productId: "github-copilot",
        hostProductId: "vscode",
        version: "2099.01",
      }),
    /No Copilot product profile/,
  );
});
