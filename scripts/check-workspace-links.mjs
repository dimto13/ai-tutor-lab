import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Prueft vor Dev-Server und Build, ob jedes Workspace-Paket in node_modules/ verlinkt ist.
//
// Ein node_modules-Verzeichnis, das aelter ist als die aktuelle Workspace-Liste, enthaelt
// die Symlinks neuer Pakete nicht. Vite meldet das nur als "Failed to resolve import" pro
// betroffener Datei -- also als Import-Fehler in Anwendungscode, der in Wahrheit korrekt
// ist. Diese Pruefung nennt stattdessen die Ursache und den einen noetigen Befehl.

const repoRoot = resolve(import.meta.dirname, "..");

function readPackageJson(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

// Unterstuetzt die im Repository verwendeten Muster: "verzeichnis/*" und feste Pfade.
function expandWorkspacePattern(pattern) {
  if (!pattern.endsWith("/*")) {
    return [join(repoRoot, pattern)];
  }
  const parent = join(repoRoot, pattern.slice(0, -2));
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name));
  } catch {
    return [];
  }
}

const rootManifest = readPackageJson(repoRoot);
const workspacePatterns = rootManifest?.workspaces ?? [];

const expected = new Map();
for (const pattern of workspacePatterns) {
  for (const directory of expandWorkspacePattern(pattern)) {
    const manifest = readPackageJson(directory);
    if (manifest?.name) {
      expected.set(manifest.name, directory);
    }
  }
}

const missing = [];
const misdirected = [];

for (const [name, directory] of expected) {
  const linkPath = join(repoRoot, "node_modules", name);
  let linkTarget;
  try {
    statSync(linkPath);
    linkTarget = realpathSync(linkPath);
  } catch {
    missing.push(name);
    continue;
  }
  if (linkTarget !== realpathSync(directory)) {
    misdirected.push({ name, linkTarget, directory });
  }
}

if (missing.length === 0 && misdirected.length === 0) {
  process.exit(0);
}

const lines = ["", "node_modules passt nicht zu den Workspace-Paketen dieses Branches.", ""];

if (missing.length > 0) {
  lines.push("Nicht verlinkt:");
  for (const name of missing) {
    lines.push(`  - ${name}`);
  }
  lines.push("");
}

for (const { name, linkTarget, directory } of misdirected) {
  lines.push(`Falsches Ziel: ${name}`);
  lines.push(`  erwartet: ${directory}`);
  lines.push(`  gefunden: ${linkTarget}`);
  lines.push("");
}

lines.push("Abhilfe:", "", "  npm ci --install-strategy=nested", "");

process.stderr.write(lines.join("\n"));
process.exit(1);
