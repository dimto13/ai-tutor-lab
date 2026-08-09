import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { technologyCatalog, validateCatalogEnvironmentReference } from "../src/catalog/index.ts";
import { parseScenario } from "../src/scenarios/contentLoader.ts";

const scenariosDir = resolve(process.cwd(), "content/scenarios");
const files = (await readdir(scenariosDir)).filter((name) => name.endsWith(".json")).sort();
const issues: string[] = [];

for (const file of files) {
  const raw = JSON.parse(await readFile(resolve(scenariosDir, file), "utf8"));
  const scenario = parseScenario(raw);
  if (!scenario.environment) continue;

  const environmentIssues = validateCatalogEnvironmentReference(
    technologyCatalog,
    scenario.environment,
  );
  for (const issue of environmentIssues) {
    issues.push(`content/scenarios/${file}:${issue.path}: ${issue.message}`);
  }
}

if (issues.length > 0) {
  console.error(`\nCatalog reference validation failed with ${issues.length} issue(s):`);
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Validated catalog environment references for ${files.length} scenario file(s).`);
