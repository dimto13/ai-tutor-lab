import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateHelpEscalation } from "../src/scenarios/helpEscalation.ts";
import type { TrainingStep } from "../src/types/training.ts";

interface StepContainer {
  steps?: unknown;
}

const scenarioDir = resolve(process.cwd(), "content/scenarios");
const introductionFiles = [resolve(process.cwd(), "content/introductions/de.json")];

function isTrainingStep(value: unknown): value is TrainingStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<TrainingStep>;
  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.helpLevels) &&
    candidate.helpLevels.length === 3 &&
    candidate.helpLevels.every((level) => typeof level === "string")
  );
}

async function validateFile(path: string, displayPath: string): Promise<string[]> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as StepContainer;
  if (!Array.isArray(parsed.steps)) return [];

  const issues: string[] = [];
  parsed.steps.forEach((rawStep) => {
    if (!isTrainingStep(rawStep)) return;
    for (const violation of validateHelpEscalation(rawStep)) {
      issues.push(
        `${displayPath} · step ${rawStep.id} · helpLevels[${violation.level - 1}]: ${violation.message}`,
      );
    }
  });
  return issues;
}

const scenarioFiles = (await readdir(scenarioDir))
  .filter((file) => file.endsWith(".json"))
  .sort();

const issues: string[] = [];
for (const file of scenarioFiles) {
  issues.push(
    ...(await validateFile(resolve(scenarioDir, file), `content/scenarios/${file}`)),
  );
}
for (const path of introductionFiles) {
  issues.push(...(await validateFile(path, "content/introductions/de.json")));
}

if (issues.length > 0) {
  console.error("Help escalation validation failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ help escalation: ${scenarioFiles.length} scenarios plus shared introductions validated`,
  );
}
