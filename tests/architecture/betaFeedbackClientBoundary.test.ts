import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = "apps/web/src/lib/betaFeedbackClient.ts";

async function source(): Promise<string> {
  return readFile(clientPath, "utf8");
}

test("beta feedback client matches the server ingest envelope", async () => {
  const code = await source();

  assert.match(code, /submitBetaFeedback\(\{\s*input:\s*\{/s);
  assert.match(code, /id:\s*record\.id/);
  assert.match(code, /source:\s*record\.source/);
  assert.match(code, /kind:\s*record\.kind/);
  assert.match(code, /text:\s*record\.text/);
  assert.match(code, /context:\s*\{/);
  assert.match(code, /scenarioId:\s*record\.context\.scenarioId/);
  assert.match(code, /stepId:\s*record\.context\.stepId/);
  assert.match(code, /mode:\s*record\.context\.mode/);
  assert.match(code, /runtimeAdapterId:\s*record\.context\.runtimeAdapterId/);
  assert.match(code, /appVersion:\s*record\.context\.appVersion/);
  assert.match(code, /commit:\s*record\.context\.commit/);
  assert.match(code, /timestamp:\s*record\.context\.timestamp/);
});

test("beta feedback client cannot assert tenant or user authority", async () => {
  const code = await source();

  assert.doesNotMatch(code, /tenant(Id)?\s*:/i);
  assert.doesNotMatch(code, /user(Id)?\s*:/i);
  assert.doesNotMatch(code, /subject\s*:/i);
  assert.match(code, /client\.mutations\.submitBetaFeedback/);
});

test("beta feedback client exposes explicit accepted/duplicate and failure results", async () => {
  const code = await source();

  assert.match(code, /\{ ok: true; duplicate: boolean \}/);
  assert.match(code, /\{ ok: false; error: string \}/);
  assert.match(code, /errors\?\.length \|\| !data\?\.accepted/);
  assert.match(code, /return \{ ok: true, duplicate: data\.duplicate \}/);
  assert.match(code, /catch \(error\)/);
});
