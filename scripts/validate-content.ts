import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import {
  RUNTIME_REFERENCE_CATALOG,
  getRuntimeReferenceDefinition,
} from "../src/runtime/referenceCatalog.ts";
import { parseScenario } from "../src/scenarios/contentLoader.ts";
import type { Scenario, Validation } from "../src/types/training.ts";

const scenariosDir = resolve(process.cwd(), "content/scenarios");
const glossaryPath = resolve(process.cwd(), "content/glossary/de.json");
const objectivesPath = resolve(process.cwd(), "content/learning-objectives/de.json");

const glossarySchema = z.object({
  version: z.number().int().positive(),
  language: z.string().min(1),
  concepts: z
    .array(
      z.object({
        key: z.string().min(1),
        term: z.string().min(1),
        aliases: z.array(z.string()).optional(),
        simple: z.string().min(1),
        advanced: z.string().min(1),
        uiTargets: z.array(z.string().min(1)),
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

function validateScenarioReferences(
  scenario: Scenario,
  file: string,
  objectiveIds: Set<string>,
  glossaryKeys: Set<string>,
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

  const runtime = getRuntimeReferenceDefinition(adapterId);
  if (!runtime) {
    issues.push({
      file,
      path: "environment.runtimeAdapterId",
      message: `unknown runtime adapter: ${adapterId}`,
    });
    return issues;
  }

  if (scenario.environment?.productId !== runtime.productId) {
    issues.push({
      file,
      path: "environment.productId",
      message: `product ${scenario.environment?.productId ?? "<missing>"} does not match runtime ${adapterId} (${runtime.productId})`,
    });
  }

  const surfaceByRef = new Map(runtime.surface.map((entry) => [entry.ref, entry]));
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
        message: `target ${target.ref} is not exposed by runtime ${adapterId}`,
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
    if (!runtime.querySelectors.includes(selector.selector)) {
      issues.push({
        file,
        path: selector.path,
        message: `state selector ${selector.selector} is not exposed by runtime ${adapterId}`,
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

if (files.length === 0) {
  throw new Error("No declarative scenario files found in content/scenarios");
}

const issues: ValidationIssue[] = [];

const glossaryRaw = JSON.parse(await readFile(glossaryPath, "utf8"));
const glossaryResult = glossarySchema.safeParse(glossaryRaw);
if (!glossaryResult.success) {
  issues.push(...formatZodIssues("content/glossary/de.json", glossaryResult.error));
}

const objectivesRaw = JSON.parse(await readFile(objectivesPath, "utf8"));
const objectivesResult = objectivesSchema.safeParse(objectivesRaw);
if (!objectivesResult.success) {
  issues.push(...formatZodIssues("content/learning-objectives/de.json", objectivesResult.error));
}

const glossaryKeys = new Set(
  glossaryResult.success ? glossaryResult.data.concepts.map((concept) => concept.key) : [],
);
const objectiveIds = new Set(
  objectivesResult.success
    ? objectivesResult.data.objectives.map((objective) => objective.id)
    : [],
);

if (glossaryResult.success) {
  pushDuplicateIssues(
    issues,
    "content/glossary/de.json",
    "concepts",
    glossaryResult.data.concepts.map((concept) => concept.key),
    "glossary concept key",
  );
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

if (glossaryResult.success) {
  glossaryResult.data.concepts.forEach((concept, conceptIndex) => {
    concept.uiTargets.forEach((ref, targetIndex) => {
      if (!allRuntimeTargets.has(ref)) {
        issues.push({
          file: "content/glossary/de.json",
          path: `concepts[${conceptIndex}].uiTargets[${targetIndex}]`,
          message: `glossary target ${ref} is not exposed by any runtime adapter`,
        });
      }
    });
  });
}

for (const file of files) {
  const relativeFile = `content/scenarios/${file}`;
  try {
    const raw = JSON.parse(await readFile(resolve(scenariosDir, file), "utf8"));
    const scenario = parseScenario(raw);
    issues.push(...validateScenarioReferences(scenario, relativeFile, objectiveIds, glossaryKeys));
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
  `Validated ${files.length} scenario file(s), ${objectiveIds.size} learning objective(s), ${glossaryKeys.size} glossary concept(s) and ${RUNTIME_REFERENCE_CATALOG.length} runtime adapter definition(s).`,
);
