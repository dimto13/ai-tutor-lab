import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  technologyCatalog,
  validateCatalogEnvironmentReference,
} from "../apps/web/src/catalog/index.ts";
import { resolveCopilotProductProfile } from "../apps/web/src/runtime/copilotProductProfile.ts";
import { parseScenario } from "../apps/web/src/scenarios/contentLoader.ts";

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

  for (const [index, integration] of (scenario.environment.integrations ?? []).entries()) {
    if (integration.runtimeAdapterId !== "github-copilot-vscode-simulator") continue;

    try {
      resolveCopilotProductProfile({
        productId: integration.productId,
        hostProductId: scenario.environment.productId,
        version: integration.version,
      });
    } catch {
      issues.push(
        `content/scenarios/${file}:environment.integrations[${index}].version: ` +
          `No registered runtime product profile for ${integration.productId}@${integration.version} ` +
          `hosted by ${scenario.environment.productId}`,
      );
    }
  }
}

if (issues.length > 0) {
  console.error(`\nCatalog reference validation failed with ${issues.length} issue(s):`);
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Validated catalog environment references for ${files.length} scenario file(s).`);
