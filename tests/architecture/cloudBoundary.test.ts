import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import test from "node:test";

const cloudNeutralRoots = [resolve("apps/web/src"), resolve("packages")];
const adapterRoot = resolve("apps/web/src/auth/adapters");
const sourceExtensions = new Set([".ts", ".tsx"]);
const cloudSdkPatterns = [
  /(?:from\s+|import\s*\()\s*["']aws-amplify(?:\/[^"']*)?["']/,
  /(?:from\s+|import\s*\()\s*["']@aws-amplify\/[^"']+["']/,
  /(?:from\s+|import\s*\()\s*["']@aws-sdk\/[^"']+["']/,
  /(?:from\s+|import\s*\()\s*["']firebase(?:\/[^"']*)?["']/,
  /(?:from\s+|import\s*\()\s*["']@google-cloud\/[^"']+["']/,
];

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

function isInside(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}${sep}`);
}

test("cloud SDK imports stay behind designated adapter boundaries", async () => {
  const violations: string[] = [];

  for (const root of cloudNeutralRoots) {
    for (const file of await collectSourceFiles(root)) {
      if (isInside(file, adapterRoot)) continue;

      const source = await readFile(file, "utf8");
      if (cloudSdkPatterns.some((pattern) => pattern.test(source))) {
        violations.push(relative(process.cwd(), file));
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Cloud SDK imports are only allowed below designated adapter directories: ${violations.join(", ")}`,
  );
});
