import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseScenario } from "../src/scenarios/contentLoader";

const scenariosDir = resolve(process.cwd(), "content/scenarios");
const files = (await readdir(scenariosDir)).filter((name) => name.endsWith(".json")).sort();

if (files.length === 0) {
  throw new Error("No declarative scenario files found in content/scenarios");
}

let failed = false;
for (const file of files) {
  try {
    const raw = JSON.parse(await readFile(resolve(scenariosDir, file), "utf8"));
    const scenario = parseScenario(raw);
    console.log(`✓ ${file} -> ${scenario.id}`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${file}`);
    console.error(error);
  }
}

if (failed) process.exit(1);
console.log(`Validated ${files.length} scenario file(s).`);
