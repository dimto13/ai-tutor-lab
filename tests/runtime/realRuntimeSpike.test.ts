import assert from "node:assert/strict";
import { test } from "node:test";
import {
  estimateFargateSessionCost,
  isRealRuntimeEvent,
  translateEmbeddedTargetRect,
} from "../../spikes/real-runtime/bridgeProtocol.ts";

test("embedded target coordinates translate into the host viewport", () => {
  assert.deepEqual(
    translateEmbeddedTargetRect(
      { top: 80, left: 120, width: 900, height: 600 },
      { top: 42, left: 8, width: 48, height: 48 },
    ),
    { top: 122, left: 128, width: 48, height: 48 },
  );
});

test("real-runtime bridge accepts canonical metadata events without document content", () => {
  const event = {
    id: "event-1",
    source: "real-editor-runtime-spike",
    type: "file.opened",
    timestamp: "2026-08-09T12:00:00.000Z",
    sessionId: "session-1",
    payload: { filename: "README.md", uriScheme: "file" },
  };

  assert.equal(
    isRealRuntimeEvent(event, {
      source: "real-editor-runtime-spike",
      sessionId: "session-1",
    }),
    true,
  );
  assert.equal(
    isRealRuntimeEvent(
      { ...event, payload: { filename: "README.md", content: "secret" } },
      { source: "real-editor-runtime-spike", sessionId: "session-1" },
    ),
    false,
  );
  assert.equal(
    isRealRuntimeEvent(
      { ...event, payload: { filename: "README.md", uriScheme: "file", DocumentText: "secret" } },
      { source: "real-editor-runtime-spike", sessionId: "session-1" },
    ),
    false,
  );
  assert.equal(
    isRealRuntimeEvent(
      { ...event, payload: { filename: "README.md", uriScheme: "file", unexpected: true } },
      { source: "real-editor-runtime-spike", sessionId: "session-1" },
    ),
    false,
  );
  assert.equal(
    isRealRuntimeEvent(event, {
      source: "real-editor-runtime-spike",
      sessionId: "another-session",
    }),
    false,
  );
});

test("Frankfurt Fargate estimate exposes architecture and storage sensitivity", () => {
  const arm = estimateFargateSessionCost({ architecture: "arm64", seconds: 3600 });
  const x86 = estimateFargateSessionCost({ architecture: "x86_64", seconds: 3600 });

  assert.equal(arm.cpuUsd, 0.03725);
  assert.equal(arm.memoryUsd, 0.00818);
  assert.equal(arm.extraStorageUsd, 0.00132);
  assert.equal(Number(arm.totalUsd.toFixed(5)), 0.04675);
  assert.equal(Number(x86.totalUsd.toFixed(4)), 0.0581);
  assert.ok(arm.totalUsd < x86.totalUsd);
});
