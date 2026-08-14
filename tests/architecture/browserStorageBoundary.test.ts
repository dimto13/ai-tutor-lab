import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import test from "node:test";

const sourceRoots = [resolve("apps/web/src"), resolve("packages")];
const sourceExtensions = new Set([".ts", ".tsx"]);
const directLocalStoragePattern = /\b(?:(?:window|globalThis)\s*\.\s*)?localStorage\b/;

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }

    if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }

  return files;
}

function isAdapterBoundary(path: string): boolean {
  return relative(process.cwd(), path).split(sep).includes("adapters");
}

test("localStorage boundary pattern covers bare and global browser access", () => {
  for (const source of [
    'localStorage.getItem("key")',
    'window.localStorage.setItem("key", "value")',
    'globalThis . localStorage.removeItem("key")',
  ]) {
    assert.match(source, directLocalStoragePattern);
  }

  assert.doesNotMatch("browserLocalStorage()", directLocalStoragePattern);
  assert.doesNotMatch("LocalStorageTrainingStateRepository", directLocalStoragePattern);
});

test("direct browser localStorage access stays behind adapter directories", async () => {
  const violations: string[] = [];

  for (const root of sourceRoots) {
    for (const file of await collectSourceFiles(root)) {
      if (isAdapterBoundary(file)) continue;
      const source = await readFile(file, "utf8");
      if (directLocalStoragePattern.test(source)) {
        violations.push(relative(process.cwd(), file));
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Direct localStorage access is only allowed below adapter directories: ${violations.join(", ")}`,
  );
});
