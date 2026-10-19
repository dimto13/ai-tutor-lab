import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

// AppSync carries every `a.json()` argument as a JSON string. A web adapter that passes the
// object unchanged fails only against the real backend, and cloud tests that post their own
// JSON string stay green. That happened three times (#528, #569, #579), so every web
// caller of such an operation has to encode the argument explicitly.

const schemaPaths = ["amplify/data/resource.ts", "amplify/data/beta-feedback-schema.ts"];
const webSourceRoot = "apps/web/src";

interface JsonArgumentOperation {
  name: string;
  jsonArguments: string[];
}

async function jsonArgumentOperations(): Promise<JsonArgumentOperation[]> {
  const operations: JsonArgumentOperation[] = [];
  for (const path of schemaPaths) {
    const schema = await readFile(path, "utf8");
    const operationPattern =
      /(\w+):\s*a\s*\.(?:mutation|query)\(\)\s*\.arguments\(\{([\s\S]*?)\}\)/g;
    for (const match of schema.matchAll(operationPattern)) {
      const jsonArguments = [...match[2]!.matchAll(/(\w+):\s*a\.json\(\)/g)].map(
        (argument) => argument[1]!,
      );
      if (jsonArguments.length > 0) operations.push({ name: match[1]!, jsonArguments });
    }
  }
  return operations;
}

async function webSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return webSourceFiles(path);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

test("the schema scan finds the known AWSJSON arguments", async () => {
  const operations = await jsonArgumentOperations();
  const byName = new Map(operations.map((operation) => [operation.name, operation.jsonArguments]));

  assert.deepEqual(byName.get("saveTrainingState"), ["payload"]);
  assert.deepEqual(byName.get("submitBetaFeedback"), ["input"]);
  assert.deepEqual(byName.get("appendTrainingTelemetryEvent"), ["event"]);
});

test("every web caller encodes its AWSJSON arguments", async () => {
  const operations = await jsonArgumentOperations();
  const files = await webSourceFiles(webSourceRoot);
  const sources = await Promise.all(
    files.map(async (path) => ({ path, code: await readFile(path, "utf8") })),
  );

  const violations: string[] = [];
  let callers = 0;
  for (const operation of operations) {
    const callPattern = new RegExp(`\\.(?:mutations|queries)\\.${operation.name}\\(`);
    for (const { path, code } of sources) {
      if (!callPattern.test(code)) continue;
      callers += 1;
      for (const argument of operation.jsonArguments) {
        const encoded = new RegExp(`\\b${argument}\\s*:[\\s\\S]{0,200}?encodeAwsJson\\(`);
        if (!encoded.test(code)) violations.push(`${path}: ${operation.name}.${argument}`);
      }
    }
  }

  assert.ok(callers >= 3, "the scan must reach the known web callers");
  assert.deepEqual(violations, []);
});
