import assert from "node:assert/strict";
import test from "node:test";
import { createCopilotRuntime } from "../../apps/web/src/runtime/copilotRuntime.ts";
import { resolveCopilotProductProfile } from "../../apps/web/src/runtime/copilotProductProfile.ts";

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
  assert.deepEqual(
    runtime.getProductProfile().chatModes.map(({ id, label, status }) => ({ id, label, status })),
    [
      { id: "ask", label: "Ask", status: undefined },
      { id: "plan", label: "Plan", status: undefined },
      { id: "agent", label: "Agent", status: undefined },
    ],
  );
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
