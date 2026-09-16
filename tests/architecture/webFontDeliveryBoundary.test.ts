import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WEB_ROOT = fileURLToPath(new URL("../../apps/web", import.meta.url));
const STYLES = join(WEB_ROOT, "src/styles.css");
const WEB_MANIFEST = join(WEB_ROOT, "package.json");

const INTER_WEIGHTS = ["400", "500", "600", "700"] as const;
const JETBRAINS_MONO_WEIGHTS = ["400", "500"] as const;

const EXTERNAL_FONT_HOSTS = /fonts\.(?:googleapis|gstatic)\.com/;

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".amplify-hosting",
  ".output",
  ".nitro",
  ".tanstack",
  ".vinxi",
  "dist",
  "test-results",
  "test-results-production-artifact",
  "playwright-report",
  "playwright-report-production-artifact",
]);

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".html", ".json"]);

async function webSourceFiles(directory: string, collected: string[] = []): Promise<string[]> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await webSourceFiles(join(directory, entry.name), collected);
      }
    } else if (entry.isFile() && SCANNED_EXTENSIONS.has(extname(entry.name))) {
      collected.push(join(directory, entry.name));
    }
  }
  return collected;
}

test("the web app serves Inter and JetBrains Mono from bundled font packages", async () => {
  const [styles, manifest] = await Promise.all([
    readFile(STYLES, "utf8"),
    readFile(WEB_MANIFEST, "utf8"),
  ]);
  const { dependencies = {} } = JSON.parse(manifest) as {
    dependencies?: Record<string, string>;
  };

  assert.ok(dependencies["@fontsource/inter"], "@fontsource/inter must stay a web dependency");
  assert.ok(
    dependencies["@fontsource/jetbrains-mono"],
    "@fontsource/jetbrains-mono must stay a web dependency",
  );

  for (const weight of INTER_WEIGHTS) {
    assert.match(styles, new RegExp(`@import "@fontsource/inter/latin-${weight}\\.css"`));
    assert.match(styles, new RegExp(`@import "@fontsource/inter/latin-ext-${weight}\\.css"`));
  }
  for (const weight of JETBRAINS_MONO_WEIGHTS) {
    assert.match(styles, new RegExp(`@import "@fontsource/jetbrains-mono/latin-${weight}\\.css"`));
    assert.match(
      styles,
      new RegExp(`@import "@fontsource/jetbrains-mono/latin-ext-${weight}\\.css"`),
    );
  }

  assert.match(styles, /--font-sans:\s*"Inter"/);
  assert.match(styles, /--font-mono:\s*"JetBrains Mono"/);
});

test("no web source sends the user's address to an external font host", async () => {
  const offenders: string[] = [];

  for (const file of await webSourceFiles(WEB_ROOT)) {
    if (EXTERNAL_FONT_HOSTS.test(await readFile(file, "utf8"))) {
      offenders.push(relative(WEB_ROOT, file));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `External font hosts must not return; fonts ship with the app (#487). Offending files: ${offenders.join(", ")}`,
  );
});
