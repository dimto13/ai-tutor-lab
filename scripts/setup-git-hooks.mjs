import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Aktiviert die versionierten Hooks aus .githooks/ als Git-Hook-Verzeichnis.
//
// Das Ausfuehrbar-Bit wird hier gesetzt, weil ueber die GitHub-Contents-API
// angelegte Dateien immer mit Modus 100644 im Baum landen. Ein Hook ohne
// Ausfuehrbar-Bit wird von Git stillschweigend uebersprungen -- die Pruefung
// waere dann wirkungslos, ohne dass es jemand merkt.

const hooksDir = ".githooks";

try {
  execFileSync("git", ["config", "core.hooksPath", hooksDir], { stdio: "ignore" });
  for (const entry of readdirSync(hooksDir)) {
    chmodSync(join(hooksDir, entry), 0o755);
  }
} catch {
  // Ausserhalb eines Git-Arbeitsverzeichnisses sind Hooks nicht relevant.
}

// Einmalige AITP-81-Migrationshilfe: Sobald die Web-App nach apps/web verschoben
// wurde, muss der Provider-Architekturtest alle produktiven Source-Roots des
// Monorepos pruefen statt des nicht mehr existierenden Root-Verzeichnisses src/.
// Der Block wird nach erfolgreicher Migration wieder entfernt.
const providerArchitectureTest = "tests/runtime/llmProvider.test.ts";
if (existsSync("apps/web/src") && existsSync(providerArchitectureTest)) {
  const source = readFileSync(providerArchitectureTest, "utf8");
  const oldBlock = `  const srcRoot = path.resolve("src");
  const allowedRoot = path.resolve("src/tutor/llm");
  const forbidden = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "localhost:11434"];

  for (const file of await collectTypeScriptFiles(srcRoot)) {
    if (file.startsWith(allowedRoot)) continue;
    const content = await readFile(file, "utf8");
    for (const token of forbidden) {
      assert.equal(
        content.includes(token),
        false,
        \`\${token} leaked into \${path.relative(srcRoot, file)}\`,
      );
    }
  }
`;
  const newBlock = `  const sourceRoots = [path.resolve("apps/web/src"), path.resolve("packages")];
  const allowedRoot = path.resolve("apps/web/src/tutor/llm");
  const forbidden = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "localhost:11434"];

  for (const sourceRoot of sourceRoots) {
    for (const file of await collectTypeScriptFiles(sourceRoot)) {
      if (file.startsWith(allowedRoot)) continue;
      const content = await readFile(file, "utf8");
      for (const token of forbidden) {
        assert.equal(
          content.includes(token),
          false,
          \`\${token} leaked into \${path.relative(process.cwd(), file)}\`,
        );
      }
    }
  }
`;
  if (source.includes(oldBlock)) {
    writeFileSync(providerArchitectureTest, source.replace(oldBlock, newBlock));
  }
}
