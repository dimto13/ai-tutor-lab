import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import test from "node:test";

const cloudNeutralRoots = [resolve("apps/web/src"), resolve("packages")];
const adapterRoot = resolve("apps/web/src/auth/adapters");
const sourceExtensions = new Set([".ts", ".tsx"]);
const cloudSdkPrefixes = [
  "aws-amplify",
  "@aws-amplify/",
  "@aws-sdk/",
  "aws-cdk-lib",
  "@aws-cdk/",
  "firebase",
  "@google-cloud/",
];
const importSpecifierPatterns = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function importedModuleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of importSpecifierPatterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

function isCloudSdkSpecifier(specifier: string): boolean {
  return cloudSdkPrefixes.some((prefix) =>
    prefix.endsWith("/") ? specifier.startsWith(prefix) : specifier === prefix || specifier.startsWith(`${prefix}/`),
  );
}

function cloudSdkImports(source: string): string[] {
  return importedModuleSpecifiers(source).filter(isCloudSdkSpecifier).sort();
}

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

test("cloud import detector covers static, side-effect, dynamic and AWS SDK imports", () => {
  const source = `
    import { fetchAuthSession } from "aws-amplify/auth";
    import "aws-amplify/auth/enable-oauth-listener";
    const cognito = await import("@aws-sdk/client-cognito-identity-provider");
    const firebase = require("firebase/app");
    import { z } from "zod";
  `;

  assert.deepEqual(cloudSdkImports(source), [
    "@aws-sdk/client-cognito-identity-provider",
    "aws-amplify/auth",
    "aws-amplify/auth/enable-oauth-listener",
    "firebase/app",
  ]);
});

test("cloud SDK imports stay behind designated adapter boundaries", async () => {
  const violations: string[] = [];

  for (const root of cloudNeutralRoots) {
    for (const file of await collectSourceFiles(root)) {
      if (isInside(file, adapterRoot)) continue;

      const source = await readFile(file, "utf8");
      const imports = cloudSdkImports(source);
      if (imports.length > 0) {
        violations.push(`${relative(process.cwd(), file)} -> ${imports.join(", ")}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Cloud SDK imports are only allowed below designated adapter directories: ${violations.join("; ")}`,
  );
});
