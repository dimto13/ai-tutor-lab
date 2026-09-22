import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modes = ["guided", "explore", "challenge"] as const;

type Artifact = {
  id: string;
  type: string;
  columns?: Array<{ key: string }>;
  rows?: Array<Record<string, string>>;
  value?: Record<string, unknown>;
};
type Scenario = {
  moduleId: string;
  mode: string;
  completionValidation: {
    kind: string;
    type: string;
    match: { artifactId: string; revisionId: string };
  };
  environment: {
    seed: {
      artifactPreview: {
        artifacts: Artifact[];
        revisions: Array<{ id: string; artifactId: string; next: Artifact }>;
      };
    };
  };
};

async function readScenario(mode: (typeof modes)[number]): Promise<Scenario> {
  const path = new URL(
    `../../content/scenarios/table-version-compare.${mode}.json`,
    import.meta.url,
  );
  return JSON.parse(await readFile(path, "utf8")) as Scenario;
}

function artifact(scenario: Scenario, id: string): Artifact {
  const found = scenario.environment.seed.artifactPreview.artifacts.find((item) => item.id === id);
  assert.ok(found, `missing artifact ${id}`);
  return found;
}

test("table version compare keeps the same declarative comparison contract in all modes", async () => {
  for (const mode of modes) {
    const scenario = await readScenario(mode);
    assert.equal(scenario.moduleId, "table-version-compare");
    assert.equal(scenario.mode, mode);

    for (const id of ["version-v1", "version-v2", "version-v3"]) {
      const table = artifact(scenario, id);
      assert.equal(table.type, "table");
      assert.deepEqual(table.columns?.map((column) => column.key), [
        "assetId",
        "name",
        "location",
        "status",
        "importNote",
      ]);
    }

    const contract = artifact(scenario, "comparison-contract");
    assert.equal(contract.type, "data");
    assert.equal(contract.value?.stableKey, "assetId");
    assert.deepEqual(contract.value?.comparedColumns, ["name", "location", "status"]);
    assert.deepEqual(contract.value?.ignoredColumns, ["importNote"]);

    const diff = artifact(scenario, "diff-result");
    assert.deepEqual(diff.value?.added, ["A-500"]);
    assert.deepEqual(diff.value?.removed, ["A-300"]);
    assert.deepEqual(diff.value?.ignored, ["importNote"]);
  }
});

test("third version preserves the identity trap and verifies addition/removal by stable id", async () => {
  for (const mode of modes) {
    const scenario = await readScenario(mode);
    const v2 = artifact(scenario, "version-v2");
    const v3 = artifact(scenario, "version-v3");
    const oldBeta = v2.rows?.find((row) => row.assetId === "A-200");
    const newBeta = v3.rows?.find((row) => row.assetId === "A-600");

    assert.equal(oldBeta?.name, "Messgerät Beta");
    assert.equal(newBeta?.name, "Messgerät Beta");
    assert.notEqual(oldBeta?.assetId, newBeta?.assetId);

    const revision = scenario.environment.seed.artifactPreview.revisions.find(
      (item) => item.id === "verify-version-diff",
    );
    assert.ok(revision, "verification revision must exist");
    assert.equal(revision.artifactId, "verification");
    assert.deepEqual(revision.next.value?.added, ["A-600"]);
    assert.deepEqual(revision.next.value?.removed, ["A-200"]);
    assert.deepEqual(revision.next.value?.changed, []);
    assert.equal(revision.next.value?.status, "verifiziert");

    assert.deepEqual(scenario.completionValidation, {
      kind: "event",
      type: "artifact.verified",
      match: {
        artifactId: "verification",
        revisionId: "verify-version-diff",
      },
    });
  }
});
