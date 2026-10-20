import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateCompletionFreeTextPolicy,
  validateStepFreeTextPolicy,
} from "../apps/web/src/scenarios/freeTextValidationPolicy.ts";

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

/**
 * Keyword lists on prompt text that predate the containsAny/includesAny check (#591). They are
 * tracked in #599 and may only shrink: a listed case that no longer violates fails as stale.
 */
const KNOWN_KEYWORD_GATES = new Set([
  "content/scenarios/copilot-basics.challenge.json · completionValidation.of[1].of[1].of[2].includesAny",
  "content/scenarios/copilot-basics.guided.json · step use-file-context · validation.containsAny.prompt",
  "content/scenarios/developer-workflow-basics.challenge.json · completionValidation.of[13].of[1].of[1].includesAny",
  "content/scenarios/developer-workflow-basics.guided.json · step step_6 · validation.containsAny.prompt",
  "content/scenarios/research-workflow.guided.json · step classify · validation.of[0].includesAny",
  "content/scenarios/research-workflow.guided.json · step classify · validation.of[1].includesAny",
  "content/scenarios/research-workflow.guided.json · step classify · validation.of[2].includesAny",
  "content/scenarios/research-workflow.guided.json · step classify · validation.of[3].includesAny",
]);

const scenarioDir = resolve(process.cwd(), "content/scenarios");
const files = (await readdir(scenarioDir)).filter((file) => file.endsWith(".json")).sort();
const issues: string[] = [];
const knownGatesSeen = new Set<string>();

function report(location: string, message: string): void {
  if (KNOWN_KEYWORD_GATES.has(location)) {
    knownGatesSeen.add(location);
    return;
  }
  issues.push(`${location}: ${message}`);
}

for (const file of files) {
  const scenario = JSON.parse(await readFile(resolve(scenarioDir, file), "utf8")) as ScenarioLike;
  if (scenario.audience?.personaId !== "non-programmer") continue;

  for (const step of scenario.steps ?? []) {
    for (const violation of validateStepFreeTextPolicy({
      validation: step.validation as never,
      exactTextValidation: step.exactTextValidation,
    })) {
      report(
        `content/scenarios/${file} · step ${step.id ?? "<unknown>"} · ${violation.path}`,
        violation.message,
      );
    }
  }

  for (const violation of validateCompletionFreeTextPolicy(
    scenario.completionValidation as never,
  )) {
    report(`content/scenarios/${file} · ${violation.path}`, violation.message);
  }
}

for (const location of KNOWN_KEYWORD_GATES) {
  if (!knownGatesSeen.has(location)) {
    issues.push(`${location}: no longer violates; remove it from KNOWN_KEYWORD_GATES (#599).`);
  }
}

if (issues.length > 0) {
  console.error("Free-text validation policy failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ free-text policy: ${files.length} scenarios checked, ${KNOWN_KEYWORD_GATES.size} known keyword gates tracked in #599`,
  );
}
