import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateCompletionFreeTextPolicy,
  validateStepFreeTextPolicy,
} from "../src/scenarios/freeTextValidationPolicy.ts";

interface ScenarioLike {
  id?: string;
  audience?: { personaId?: string };
  steps?: Array<{
    id?: string;
    validation?: unknown;
    exactTextValidation?: boolean;
  }>;
  completionValidation?: unknown;
}

const scenarioDir = resolve(process.cwd(), "content/scenarios");
const files = (await readdir(scenarioDir)).filter((file) => file.endsWith(".json")).sort();
const issues: string[] = [];

for (const file of files) {
  const scenario = JSON.parse(await readFile(resolve(scenarioDir, file), "utf8")) as ScenarioLike;
  if (scenario.audience?.personaId !== "non-programmer") continue;

  for (const step of scenario.steps ?? []) {
    for (const violation of validateStepFreeTextPolicy({
      validation: step.validation as never,
      exactTextValidation: step.exactTextValidation,
    })) {
      issues.push(
        `content/scenarios/${file} · step ${step.id ?? "<unknown>"} · ${violation.path}: ${violation.message}`,
      );
    }
  }

  for (const violation of validateCompletionFreeTextPolicy(
    scenario.completionValidation as never,
  )) {
    issues.push(`content/scenarios/${file} · ${violation.path}: ${violation.message}`);
  }
}

if (issues.length > 0) {
  console.error("Free-text validation policy failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`✓ free-text policy: ${files.length} scenarios checked`);
}
