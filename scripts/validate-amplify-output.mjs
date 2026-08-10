import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDir = resolve("apps/web/.amplify-hosting");
const manifestPath = resolve(outputDir, "deploy-manifest.json");
const serverPath = resolve(outputDir, "compute/default/server.js");

await access(manifestPath);
await access(serverPath);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.version !== 1) {
  throw new Error(`Unexpected Amplify deployment manifest version: ${String(manifest.version)}`);
}

if (!Array.isArray(manifest.routes) || !manifest.routes.some((route) => route.path === "/*")) {
  throw new Error("Amplify deployment manifest must contain a catch-all route");
}

const defaultCompute = manifest.computeResources?.find((resource) => resource.name === "default");
if (!defaultCompute) {
  throw new Error("Amplify deployment manifest is missing the default compute resource");
}
if (defaultCompute.entrypoint !== "server.js") {
  throw new Error(`Unexpected Amplify compute entrypoint: ${String(defaultCompute.entrypoint)}`);
}
if (defaultCompute.runtime !== "nodejs22.x") {
  throw new Error(`Unexpected Amplify compute runtime: ${String(defaultCompute.runtime)}`);
}

if (!manifest.framework?.name) {
  throw new Error("Amplify deployment manifest is missing framework metadata");
}

console.log(
  `Amplify deployment bundle valid: ${manifest.framework.name} -> ${defaultCompute.runtime}`,
);
