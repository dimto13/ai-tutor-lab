import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolchainOnly = process.argv.includes("--toolchain-only");
const errors = [];

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: erwartet ${expected}, gefunden ${String(actual)}`);
  }
}

function exactVersion(label, value) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
    errors.push(`${label}: exakte SemVer erwartet, gefunden ${String(value)}`);
  }
  return value;
}

function currentNpmVersion() {
  const userAgent = process.env.npm_config_user_agent;
  const match = userAgent?.match(/(?:^|\s)npm\/([^\s]+)/);
  if (match) return match[1];

  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  return execFileSync(executable, ["--version"], { encoding: "utf8" }).trim();
}

const rootManifest = readJson("package.json");
const webManifest = readJson("apps/web/package.json");
const lockfile = readJson("package-lock.json");
const nodePin = readFileSync(join(repoRoot, ".nvmrc"), "utf8").trim();
const packageManagerMatch = rootManifest.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/);

exactVersion(".nvmrc", nodePin);
if (!packageManagerMatch) {
  errors.push(`packageManager: npm@<exakte Version> erwartet, gefunden ${rootManifest.packageManager}`);
}
const npmPin = packageManagerMatch?.[1];

expectEqual("engines.node", rootManifest.engines?.node, nodePin);
if (npmPin) expectEqual("engines.npm", rootManifest.engines?.npm, npmPin);
expectEqual("Node runtime", process.version.replace(/^v/, ""), nodePin);
if (npmPin) expectEqual("npm runtime", currentNpmVersion(), npmPin);

const reactVersion = exactVersion("runtimeContract.react", rootManifest.runtimeContract?.react);
const reactDomVersion = exactVersion(
  "runtimeContract.reactDom",
  rootManifest.runtimeContract?.reactDom,
);
const viteVersion = exactVersion("runtimeContract.vite", rootManifest.runtimeContract?.vite);

expectEqual("dependencies.react", rootManifest.dependencies?.react, reactVersion);
expectEqual("dependencies.react-dom", rootManifest.dependencies?.["react-dom"], reactDomVersion);
expectEqual(
  "package-lock root React spec",
  lockfile.packages?.[""]?.dependencies?.react,
  rootManifest.dependencies?.react,
);
expectEqual(
  "package-lock root React DOM spec",
  lockfile.packages?.[""]?.dependencies?.["react-dom"],
  rootManifest.dependencies?.["react-dom"],
);
expectEqual(
  "package-lock apps/web React spec",
  lockfile.packages?.["apps/web"]?.dependencies?.react,
  webManifest.dependencies?.react,
);
expectEqual(
  "package-lock apps/web React DOM spec",
  lockfile.packages?.["apps/web"]?.dependencies?.["react-dom"],
  webManifest.dependencies?.["react-dom"],
);
expectEqual(
  "package-lock apps/web Vite spec",
  lockfile.packages?.["apps/web"]?.devDependencies?.vite,
  webManifest.devDependencies?.vite,
);
expectEqual("package-lock product React", lockfile.packages?.["node_modules/react"]?.version, reactVersion);
expectEqual(
  "package-lock product React DOM",
  lockfile.packages?.["node_modules/react-dom"]?.version,
  reactDomVersion,
);
expectEqual("package-lock product Vite", lockfile.packages?.["node_modules/vite"]?.version, viteVersion);

if (!toolchainOnly) {
  expectEqual("installed product React", readJson("node_modules/react/package.json").version, reactVersion);
  expectEqual(
    "installed product React DOM",
    readJson("node_modules/react-dom/package.json").version,
    reactDomVersion,
  );
  expectEqual("installed product Vite", readJson("node_modules/vite/package.json").version, viteVersion);
}

if (errors.length > 0) {
  process.stderr.write(
    [
      "Beta-Runtime-Vertrag ist nicht reproduzierbar:",
      ...errors.map((error) => `  - ${error}`),
      "",
      "Abhilfe: Repository-Pin aktivieren und sauber installieren:",
      "  nvm use",
      "  npm ci",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const suffix = toolchainOnly ? " (Toolchain/Lockfile)" : "";
process.stdout.write(
  `Beta runtime contract OK${suffix}: Node ${nodePin}, npm ${npmPin}, React ${reactVersion}, React DOM ${reactDomVersion}, Vite ${viteVersion}\n`,
);
