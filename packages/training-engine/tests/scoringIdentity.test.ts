import assert from "node:assert/strict";
import test from "node:test";
import { createScoreAwardId, createScoreEvent } from "../src/scoring.ts";

test("score award id uses the same length-prefixed identity contract as the server adapter", () => {
  const id = createScoreAwardId({
    subject: { userId: "user:1", tenantId: "tenant|a" },
    scenarioId: "vscode-basics.guided",
    scenarioVersion: "3",
  });

  assert.equal(id, "score-award:v1|t:s8:tenant|a|u:s6:user:1|s:s20:vscode-basics.guided|v:s1:3");
});

test("score event retains the authoritative source revision for audit", () => {
  const event = createScoreEvent({
    subject: { userId: "user-1", tenantId: "tenant-1" },
    scenarioId: "vscode-basics.guided",
    scenarioVersion: "1",
    sessionId: "session-1",
    occurredAt: 1_786_779_200_000,
    sourceRevision: 7,
    scenarioPoints: 100,
    mode: "guided",
    stepIds: ["step-1"],
  });

  assert.equal(event.sourceRevision, 7);
  assert.equal(event.points, 100);
});
