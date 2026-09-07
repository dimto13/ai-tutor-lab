import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = "apps/web/src/lib/betaFeedbackClient.ts";

async function source(): Promise<string> {
  return readFile(clientPath, "utf8");
}

test("beta feedback client preserves structured training context", async () => {
  const code = await source();

  assert.match(code, /feedbackId:\s*record\.id/);
  assert.match(code, /source:\s*record\.source/);
  assert.match(code, /kind:\s*record\.kind/);
  assert.match(code, /message:\s*record\.text/);
  assert.match(code, /scenarioId:\s*record\.context\.scenarioId/);
  assert.match(code, /stepId:\s*record\.context\.stepId/);
  assert.match(code, /mode:\s*record\.context\.mode/);
  assert.match(code, /runtimeAdapterId:\s*record\.context\.runtimeAdapterId/);
  assert.match(code, /runtimeContext:\s*JSON\.stringify\(record\.context\.runtime\)/);
  assert.match(code, /appVersion:\s*record\.context\.appVersion/);
  assert.match(code, /commit:\s*record\.context\.commit/);
});

test("beta feedback client cannot assert tenant or user authority", async () => {
  const code = await source();

  assert.doesNotMatch(code, /tenant(Id)?\s*:/i);
  assert.doesNotMatch(code, /user(Id)?\s*:/i);
  assert.doesNotMatch(code, /subject\s*:/i);
  assert.match(code, /client\.mutations\.submitBetaFeedback/);
});

test("beta feedback client exposes explicit success and failure results", async () => {
  const code = await source();

  assert.match(code, /\{ ok: true; feedbackId: string \}/);
  assert.match(code, /\{ ok: false; error: string \}/);
  assert.match(code, /errors\?\.length \|\| !data\?\.feedbackId/);
  assert.match(code, /return \{ ok: true, feedbackId: data\.feedbackId \}/);
  assert.match(code, /catch \(error\)/);
});
