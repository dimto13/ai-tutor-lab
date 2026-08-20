import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";
import { createResearchWorkflowVariants } from "../../apps/web/src/scenarios/researchWorkflowVariants.ts";
import type { Validation } from "../../apps/web/src/types/training.ts";

const raw = JSON.parse(
  await readFile(
    new URL("../../content/scenarios/research-workflow.guided.json", import.meta.url),
    "utf8",
  ),
);
const guided = parseScenario(raw);
const [explore, challenge] = createResearchWorkflowVariants(guided);

function flattenValidation(validation: Validation | undefined): Validation[] {
  if (!validation) return [];
  if ("of" in validation) {
    const children = Array.isArray(validation.of) ? validation.of : [validation.of];
    return [validation, ...children.flatMap((child) => flattenValidation(child))];
  }
  return [validation];
}

function stateChecks(validation: Validation | undefined, selector: string): Validation[] {
  return flattenValidation(validation).filter(
    (entry) => entry.kind === "state" && entry.selector === selector,
  );
}

test("research workflow exposes all three modes on the ai-workflow module", () => {
  assert.deepEqual(
    [explore, guided, challenge].map(({ id, mode, moduleId, learningLayer }) => ({
      id,
      mode,
      moduleId,
      learningLayer,
    })),
    [
      {
        id: "research-workflow.explore",
        mode: "explore",
        moduleId: "research-workflow",
        learningLayer: "ai_workflow",
      },
      {
        id: "research-workflow.guided",
        mode: "guided",
        moduleId: "research-workflow",
        learningLayer: "ai_workflow",
      },
      {
        id: "research-workflow.challenge",
        mode: "challenge",
        moduleId: "research-workflow",
        learningLayer: "ai_workflow",
      },
    ],
  );
});

test("research workflow is deterministic and shows source type, freshness and quality metadata", () => {
  const seed = guided.environment?.seed as {
    contents?: Record<string, string>;
    artifactPreview?: {
      artifacts?: Array<{ id: string; title: string; value?: unknown; rows?: unknown[] }>;
    };
  };
  const brief = seed.contents?.["research-brief.md"] ?? "";
  assert.match(brief, /deterministisch/i);
  assert.match(brief, /keine echten Web- oder MCP-Aufrufe/i);

  const artifacts = seed.artifactPreview?.artifacts ?? [];
  const sourceA = artifacts.find(({ id }) => id === "source-a");
  const sourceB = artifacts.find(({ id }) => id === "source-b");
  const sourceC = artifacts.find(({ id }) => id === "source-c");
  const comparison = artifacts.find(({ id }) => id === "comparison");

  assert.match(sourceA?.title ?? "", /Herstellerdokumentation/);
  assert.match(String(sourceA?.value ?? ""), /8 von 10.*80 %/s);
  assert.match(sourceB?.title ?? "", /Community-Beitrag/);
  assert.match(String(sourceB?.value ?? ""), /2023/);
  assert.match(String(sourceB?.value ?? ""), /veraltet/);
  assert.match(sourceC?.title ?? "", /Offizieller Blog/);
  assert.match(String(sourceC?.value ?? ""), /aktuell/);
  assert.match(JSON.stringify(comparison?.rows ?? []), /90 %/);
  assert.match(JSON.stringify(comparison?.rows ?? []), /Quellentyp|Herstellerdokumentation/);
  assert.match(JSON.stringify(comparison?.rows ?? []), /aktuell|veraltet/);
});

test("guided verification requires both defects before active transfer", () => {
  const sourceAStep = guided.steps.find(({ id }) => id === "source-a");
  const sourceBStep = guided.steps.find(({ id }) => id === "source-b");
  const transferStep = guided.steps.find(({ id }) => id === "classify");

  assert.deepEqual(sourceAStep?.validation, {
    kind: "event",
    type: "artifact.verified",
    match: { artifactId: "source-a" },
  });
  assert.deepEqual(sourceBStep?.validation, {
    kind: "event",
    type: "artifact.verified",
    match: { artifactId: "source-b" },
  });
  assert.equal(stateChecks(transferStep?.validation, "copilot.prompt.last").length, 4);
});

test("explore stays on the generic surface-inspection contract", () => {
  assert.equal(explore.completionValidation, undefined);
  assert.ok(explore.exploreTargets?.includes("artifact.preview.verify"));
  assert.ok(explore.exploreTargets?.includes("copilot.chat.prompt"));
});

test("challenge requires both defects, keeps the control source unmarked and requires active transfer", () => {
  const verifiedChecks = stateChecks(challenge.completionValidation, "artifact.verifiedIds");
  assert.ok(
    verifiedChecks.some((entry) => entry.kind === "state" && entry.includes === "source-a"),
  );
  assert.ok(
    verifiedChecks.some((entry) => entry.kind === "state" && entry.includes === "source-b"),
  );
  assert.ok(
    verifiedChecks.some((entry) => entry.kind === "state" && entry.excludes === "source-c"),
  );
  assert.equal(stateChecks(challenge.completionValidation, "artifact.active.id").length, 0);
  assert.equal(stateChecks(challenge.completionValidation, "copilot.prompt.last").length, 4);
});
