import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import { technologyCatalog } from "../apps/web/src/catalog/index.ts";
import {
  RUNTIME_REFERENCE_CATALOG,
  getRuntimeReferenceDefinition,
} from "../apps/web/src/runtime/referenceCatalog.ts";
import { parseScenario } from "../apps/web/src/scenarios/contentLoader.ts";
import type { RuntimeReferenceDefinition } from "../apps/web/src/runtime/vscodeDefinition.ts";
import type { Scenario, Validation } from "../apps/web/src/types/training.ts";

const scenariosDir = resolve(process.cwd(), "content/scenarios");
const glossaryDir = resolve(process.cwd(), "content/glossary");
const objectivesPath = resolve(process.cwd(), "content/learning-objectives/de.json");
const personasPath = resolve(process.cwd(), "content/personas/de.json");

const technologyIds = new Set(technologyCatalog.technologies.map((technology) => technology.id));

const glossaryConceptSchema = z.object({
  key: z.string().min(1),
  term: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  simple: z.string().min(1),
  advanced: z.string().min(1),
  uiTargets: z.array(z.string().min(1)),
});

const glossarySchema = z.object({
  version: z.number().int().positive().optional(),
  language: z.string().min(1),
  technologyConcepts: z.record(z.array(z.string().min(1)).min(1)),
  concepts: z.array(glossaryConceptSchema).min(1),
});

type GlossaryData = z.infer<typeof glossarySchema>;

interface GlossarySource {
  file: string;
  data: GlossaryData;
}

const personasSchema = z.object({
  version: z.number().int().positive(),
  language: z.string().min(1),
  personas: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1),
        assumedKnowledge: z.array(z.string().min(1)),
        guidancePrinciples: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

const objectivesSchema = z.object({
  version: z.number().int().positive(),
  language: z.string().min(1),
  objectives: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
});

interface ValidationIssue {
  file: string;
  path: string;
  message: string;
}

function pushDuplicateIssues(
  issues: ValidationIssue[],
  file: string,
  path: string,
  values: string[],
  label: string,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      issues.push({
        file,
        path: `${path}[${index}]`,
        message: `duplicate ${label}: ${value}`,
      });
    }
    seen.add(value);
  });
}

function collectStateSelectors(
  validation: Validation | undefined,
  path: string,
): Array<{ selector: string; path: string }> {
  if (!validation) return [];
  if (validation.kind === "state") {
    return [{ selector: validation.selector, path: `${path}.selector` }];
  }
  if (validation.kind === "all") {
    return validation.of.flatMap((item, index) =>
      collectStateSelectors(item, `${path}.of[${index}]`),
    );
  }
  return [];
}

function participatingRuntimeDefinitions(
  scenario: Scenario,
  file: string,
  issues: ValidationIssue[],
): RuntimeReferenceDefinition[] {
  const primaryId = scenario.environment?.runtimeAdapterId;
  if (!primaryId) return [];

  const primary = getRuntimeReferenceDefinition(primaryId);
  if (!primary) {
    issues.push({
      file,
      path: "environment.runtimeAdapterId",
      message: `unknown runtime adapter: ${primaryId}`,
    });
    return [];
  }

  if (scenario.environment?.productId !== primary.productId) {
    issues.push({
      file,
      path: "environment.productId",
      message: `product ${scenario.environment?.productId ?? "<missing>"} does not match runtime ${primaryId} (${primary.productId})`,
    });
  }

  const runtimes: RuntimeReferenceDefinition[] = [primary];
  for (const [index, integrationId] of (
    scenario.environment?.integrationRuntimeAdapterIds ?? []
  ).entries()) {
    const integration = getRuntimeReferenceDefinition(integrationId);
    if (!integration) {
      issues.push({
        file,
        path: `environment.integrationRuntimeAdapterIds[${index}]`,
        message: `unknown integration runtime adapter: ${integrationId}`,
      });
      continue;
    }
    if (!integration.hostProductId) {
      issues.push({
        file,
        path: `environment.integrationRuntimeAdapterIds[${index}]`,
        message: `runtime ${integrationId} is not declared as a hosted product integration`,
      });
      continue;
    }
    if (integration.hostProductId !== primary.productId) {
      issues.push({
        file,
        path: `environment.integrationRuntimeAdapterIds[${index}]`,
        message: `runtime ${integrationId} requires host ${integration.hostProductId}, not ${primary.productId}`,
      });
      continue;
    }
    runtimes.push(integration);
  }
  return runtimes;
}

function validateScenarioReferences(
  scenario: Scenario,
  file: string,
  objectiveIds: Set<string>,
  glossaryKeys: Set<string>,
  personaIds: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const adapterId = scenario.environment?.runtimeAdapterId;

  scenario.learningObjectives?.forEach((objectiveId, index) => {
    if (!objectiveIds.has(objectiveId)) {
      issues.push({
        file,
        path: `learningObjectives[${index}]`,
        message: `unknown learning objective: ${objectiveId}`,
      });
    }
  });

  if (scenario.audience) {
    if (!personaIds.has(scenario.audience.personaId)) {
      issues.push({
        file,
        path: "audience.personaId",
        message: `unknown learner persona: ${scenario.audience.personaId}`,
      });
    }
    pushDuplicateIssues(
      issues,
      file,
      "audience.glossaryConcepts",
      scenario.audience.glossaryConcepts,
      "scenario glossary concept",
    );
    scenario.audience.glossaryConcepts.forEach((conceptKey, index) => {
      if (!glossaryKeys.has(conceptKey)) {
        issues.push({
          file,
          path: `audience.glossaryConcepts[${index}]`,
          message: `unknown glossary concept: ${conceptKey}`,
        });
      }
    });

    const introductionStepIds = scenario.audience.introductionStepIds ?? [];
    pushDuplicateIssues(
      issues,
      file,
      "audience.introductionStepIds",
      introductionStepIds,
      "introduction step id",
    );
    introductionStepIds.forEach((stepId, index) => {
      const scenarioStepIndex = scenario.steps.findIndex((step) => step.id === stepId);
      const step = scenario.steps[scenarioStepIndex];
      if (!step) {
        issues.push({
          file,
          path: `audience.introductionStepIds[${index}]`,
          message: `unknown introduction step: ${stepId}`,
        });
        return;
      }
      if (scenarioStepIndex !== index) {
        issues.push({
          file,
          path: `audience.introductionStepIds[${index}]`,
          message: "introduction steps must form a contiguous block at the scenario start",
        });
      }
      if (step.stepType !== "explanation" || !step.optional) {
        issues.push({
          file,
          path: `steps[${scenarioStepIndex}]`,
          message: "introduction steps must be optional explanation steps",
        });
      }
    });
  }

  if (!adapterId) {
    const hasRuntimeReferences =
      (scenario.exploreTargets?.length ?? 0) > 0 ||
      scenario.steps.some((step) => Boolean(step.highlightTarget)) ||
      collectStateSelectors(scenario.completionValidation, "completionValidation").length > 0;
    if (hasRuntimeReferences) {
      issues.push({
        file,
        path: "environment.runtimeAdapterId",
        message: "runtime references require an environment.runtimeAdapterId",
      });
    }
    return issues;
  }

  const runtimes = participatingRuntimeDefinitions(scenario, file, issues);
  if (runtimes.length === 0) return issues;

  const surfaceByRef = new Map(
    runtimes.flatMap((runtime) => runtime.surface.map((entry) => [entry.ref, entry] as const)),
  );
  const targetRefs: Array<{ ref: string; path: string }> = [];

  scenario.exploreTargets?.forEach((ref, index) => {
    targetRefs.push({ ref, path: `exploreTargets[${index}]` });
  });
  scenario.steps.forEach((step, index) => {
    if (step.highlightTarget) {
      targetRefs.push({ ref: step.highlightTarget, path: `steps[${index}].highlightTarget` });
    }
  });

  for (const target of targetRefs) {
    const surface = surfaceByRef.get(target.ref);
    if (!surface) {
      issues.push({
        file,
        path: target.path,
        message: `target ${target.ref} is not exposed by the scenario runtime environment`,
      });
      continue;
    }
    if (!glossaryKeys.has(surface.conceptKey)) {
      issues.push({
        file,
        path: target.path,
        message: `target ${target.ref} points to missing glossary concept ${surface.conceptKey}`,
      });
    }
  }

  const selectors = [
    ...collectStateSelectors(scenario.completionValidation, "completionValidation"),
    ...scenario.steps.flatMap((step, index) =>
      collectStateSelectors(step.validation, `steps[${index}].validation`),
    ),
  ];
  for (const selector of selectors) {
    const exposingRuntime = runtimes.find((runtime) =>
      runtime.querySelectors.includes(selector.selector),
    );
    if (!exposingRuntime) {
      issues.push({
        file,
        path: selector.path,
        message: `state selector ${selector.selector} is not exposed by the scenario runtime environment`,
      });
    }
  }

  return issues;
}

function formatZodIssues(file: string, error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
    message: issue.message,
  }));
}

const files = (await readdir(scenariosDir)).filter((name) => name.endsWith(".json")).sort();
const glossaryFiles = (await readdir(glossaryDir)).filter((name) => name.endsWith(".json")).sort();

if (files.length === 0) {
  throw new Error("No declarative scenario files found in content/scenarios");
}
if (glossaryFiles.length === 0) {
  throw new Error("No declarative glossary files found in content/glossary");
}

const issues: ValidationIssue[] = [];
const glossarySources: GlossarySource[] = [];

for (const file of glossaryFiles) {
  const relativeFile = `content/glossary/${file}`;
  const raw = JSON.parse(await readFile(resolve(glossaryDir, file), "utf8"));
  const result = glossarySchema.safeParse(raw);
  if (!result.success) {
    issues.push(...formatZodIssues(relativeFile, result.error));
    continue;
  }
  glossarySources.push({ file: relativeFile, data: result.data });
}

const objectivesRaw = JSON.parse(await readFile(objectivesPath, "utf8"));
const objectivesResult = objectivesSchema.safeParse(objectivesRaw);
if (!objectivesResult.success) {
  issues.push(...formatZodIssues("content/learning-objectives/de.json", objectivesResult.error));
}

const personasRaw = JSON.parse(await readFile(personasPath, "utf8"));
const personasResult = personasSchema.safeParse(personasRaw);
if (!personasResult.success) {
  issues.push(...formatZodIssues("content/personas/de.json", personasResult.error));
}

const allGlossaryConcepts = glossarySources.flatMap(({ file, data }) =>
  data.concepts.map((concept, index) => ({ file, concept, index })),
);
const glossaryKeys = new Set(allGlossaryConcepts.map(({ concept }) => concept.key));
const objectiveIds = new Set(
  objectivesResult.success ? objectivesResult.data.objectives.map((objective) => objective.id) : [],
);
const personaIds = new Set(
  personasResult.success ? personasResult.data.personas.map((persona) => persona.id) : [],
);

const seenGlossaryKeys = new Map<string, string>();
for (const { file, concept, index } of allGlossaryConcepts) {
  const firstFile = seenGlossaryKeys.get(concept.key);
  if (firstFile) {
    issues.push({
      file,
      path: `concepts[${index}].key`,
      message: `duplicate glossary concept key: ${concept.key} (already declared in ${firstFile})`,
    });
  } else {
    seenGlossaryKeys.set(concept.key, file);
  }
}

if (objectivesResult.success) {
  pushDuplicateIssues(
    issues,
    "content/learning-objectives/de.json",
    "objectives",
    objectivesResult.data.objectives.map((objective) => objective.id),
    "learning objective id",
  );
}

if (personasResult.success) {
  pushDuplicateIssues(
    issues,
    "content/personas/de.json",
    "personas",
    personasResult.data.personas.map((persona) => persona.id),
    "learner persona id",
  );
}

const mappedConceptKeys = new Set<string>();
for (const source of glossarySources) {
  for (const [technologyId, conceptKeys] of Object.entries(source.data.technologyConcepts)) {
    if (!technologyIds.has(technologyId)) {
      issues.push({
        file: source.file,
        path: `technologyConcepts.${technologyId}`,
        message: `unknown technology id: ${technologyId}`,
      });
    }
    pushDuplicateIssues(
      issues,
      source.file,
      `technologyConcepts.${technologyId}`,
      conceptKeys,
      "technology glossary concept",
    );
    conceptKeys.forEach((conceptKey, index) => {
      mappedConceptKeys.add(conceptKey);
      if (!glossaryKeys.has(conceptKey)) {
        issues.push({
          file: source.file,
          path: `technologyConcepts.${technologyId}[${index}]`,
          message: `unknown glossary concept: ${conceptKey}`,
        });
      }
    });
  }
}

for (const { file, concept, index } of allGlossaryConcepts) {
  if (!mappedConceptKeys.has(concept.key)) {
    issues.push({
      file,
      path: `concepts[${index}].key`,
      message: `glossary concept is not assigned to a technology: ${concept.key}`,
    });
  }
}

const allRuntimeTargets = new Set<string>();
for (const runtime of RUNTIME_REFERENCE_CATALOG) {
  pushDuplicateIssues(
    issues,
    `runtime:${runtime.id}`,
    "surface",
    runtime.surface.map((entry) => entry.ref),
    "runtime target ref",
  );
  for (const entry of runtime.surface) {
    allRuntimeTargets.add(entry.ref);
    if (!glossaryKeys.has(entry.conceptKey)) {
      issues.push({
        file: `runtime:${runtime.id}`,
        path: `surface.${entry.ref}.conceptKey`,
        message: `missing glossary concept: ${entry.conceptKey}`,
      });
    }
  }
}

for (const { file, concept, index } of allGlossaryConcepts) {
  concept.uiTargets.forEach((ref, targetIndex) => {
    if (!allRuntimeTargets.has(ref)) {
      issues.push({
        file,
        path: `concepts[${index}].uiTargets[${targetIndex}]`,
        message: `glossary target ${ref} is not exposed by any runtime adapter`,
      });
    }
  });
}

for (const file of files) {
  const relativeFile = `content/scenarios/${file}`;
  try {
    const raw = JSON.parse(await readFile(resolve(scenariosDir, file), "utf8"));
    const scenario = parseScenario(raw);
    issues.push(
      ...validateScenarioReferences(scenario, relativeFile, objectiveIds, glossaryKeys, personaIds),
    );
    console.log(`✓ ${file} -> ${scenario.id}`);
  } catch (error) {
    if (error instanceof ZodError) {
      issues.push(...formatZodIssues(relativeFile, error));
    } else {
      issues.push({
        file: relativeFile,
        path: "<root>",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

if (issues.length > 0) {
  console.error(`\nContent validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${files.length} scenario file(s), ${objectiveIds.size} learning objective(s), ${glossaryKeys.size} glossary concept(s) from ${glossarySources.length} source file(s), ${personaIds.size} learner persona(s) and ${RUNTIME_REFERENCE_CATALOG.length} runtime adapter definition(s).`,
);
