import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDidacticPatternById, moduleLineCatalog } from "../packages/catalog/src/index.ts";
import { parseScenario } from "../apps/web/src/scenarios/contentLoader.ts";
import type { Scenario } from "../apps/web/src/types/training.ts";

const scenariosDir = resolve(process.cwd(), "content/scenarios");
const scenarioFiles = (await readdir(scenariosDir)).filter((file) => file.endsWith(".json"));
const scenarios: Scenario[] = [];

for (const file of scenarioFiles) {
  const raw = JSON.parse(await readFile(resolve(scenariosDir, file), "utf8"));
  scenarios.push(parseScenario(raw));
}

const expectedAiWorkflowPhases = [
  "context",
  "task",
  "ai-use",
  "artifact",
  "iteration",
  "verification",
  "transfer",
];
const issues: string[] = [];

for (const line of moduleLineCatalog.lines) {
  const pattern = getDidacticPatternById(moduleLineCatalog, line.patternId);
  if (!pattern) {
    issues.push(`${line.id}: unknown pattern ${line.patternId}`);
    continue;
  }

  if (line.learningLayer === "ai_workflow") {
    const phaseIds = pattern.phases.map(({ id }) => id);
    if (JSON.stringify(phaseIds) !== JSON.stringify(expectedAiWorkflowPhases)) {
      issues.push(
        `${line.id}: ai_workflow pattern must use the seven phases ${expectedAiWorkflowPhases.join(", ")}`,
      );
    }

    const verificationPhase = pattern.phases[5];
    if (verificationPhase?.id !== "verification" || !verificationPhase.verificationContract) {
      issues.push(
        `${line.id}: phase 6 must be verification with embedded weakness, active learner action, deterministic validation and feedback`,
      );
    }
  }

  for (const moduleId of line.moduleIds) {
    const moduleScenarios = scenarios.filter((scenario) => scenario.moduleId === moduleId);
    if (moduleScenarios.length === 0) {
      issues.push(`${line.id}: unknown moduleId ${moduleId}`);
      continue;
    }

    const wrongLayer = moduleScenarios.find(
      (scenario) => scenario.learningLayer !== line.learningLayer,
    );
    if (wrongLayer) {
      issues.push(
        `${line.id}: module ${moduleId} contains ${wrongLayer.id} with learningLayer ${wrongLayer.learningLayer}, expected ${line.learningLayer}`,
      );
    }
  }
}

if (issues.length > 0) {
  console.error(`Module-line validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `Validated ${moduleLineCatalog.lines.length} module line(s) and ${moduleLineCatalog.patterns.length} didactic pattern(s).`,
);
