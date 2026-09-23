import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modes = ["guided", "explore", "challenge"] as const;

type Artifact = {
  id: string;
  type: string;
  columns?: Array<{ key: string }>;
  rows?: Array<Record<string, string>>;
  value?: unknown;
};
type Revision = { id: string; artifactId: string; next: Artifact };
type Scenario = {
  moduleId: string;
  mode: string;
  completionValidation?: {
    kind: string;
    type: string;
    match: { artifactId: string; revisionId: string };
  };
  environment: {
    seed: {
      artifactPreview: {
        artifacts: Artifact[];
        revisions?: Revision[];
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

function valueObject(artifactValue: unknown): Record<string, unknown> {
  assert.ok(
    typeof artifactValue === "object" && artifactValue !== null && !Array.isArray(artifactValue),
    "artifact value must be an object",
  );
  return artifactValue as Record<string, unknown>;
}

function revision(scenario: Scenario): Revision {
  const found = scenario.environment.seed.artifactPreview.revisions?.find(
    (item) => item.id === "verify-version-diff",
  );
  assert.ok(found, "verification revision must exist");
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

    const contract = valueObject(artifact(scenario, "comparison-contract").value);
    assert.equal(contract.stableKey, "assetId");
    assert.deepEqual(contract.comparedColumns, ["name", "location", "status"]);
    assert.deepEqual(contract.ignoredColumns, ["importNote"]);
  }
});

test("each mode exposes comparison evidence appropriate to its learning contract", async () => {
  const guided = await readScenario("guided");
  const guidedDiff = valueObject(artifact(guided, "diff-result").value);
  assert.deepEqual(guidedDiff.added, ["A-500"]);
  assert.deepEqual(guidedDiff.removed, ["A-300"]);
  assert.deepEqual(guidedDiff.ignored, ["importNote"]);

  const explore = await readScenario("explore");
  const controlResult = artifact(explore, "control-result");
  assert.equal(controlResult.type, "data");
  assert.match(String(controlResult.value), /A-500/);
  assert.match(String(controlResult.value), /A-300/);
  assert.match(String(controlResult.value), /A-600/);
  assert.match(String(controlResult.value), /A-200/);

  const challenge = await readScenario("challenge");
  const challengeRevision = revision(challenge);
  assert.equal(challengeRevision.artifactId, "diff-result");
  const challengeValue = valueObject(challengeRevision.next.value);
  const v1ToV2 = challengeValue.v1ToV2 as Record<string, unknown>;
  assert.deepEqual(v1ToV2.added, ["A-500"]);
  assert.deepEqual(v1ToV2.removed, ["A-300"]);
  assert.deepEqual(challengeValue.ignoredColumns, ["importNote"]);
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
  }

  const guided = await readScenario("guided");
  const guidedRevision = revision(guided);
  assert.equal(guidedRevision.artifactId, "verification");
  const guidedValue = valueObject(guidedRevision.next.value);
  assert.deepEqual(guidedValue.added, ["A-600"]);
  assert.deepEqual(guidedValue.removed, ["A-200"]);
  assert.deepEqual(guidedValue.changed, []);
  assert.equal(guidedValue.status, "verifiziert");
  assert.deepEqual(guided.completionValidation, {
    kind: "event",
    type: "artifact.verified",
    match: {
      artifactId: "verification",
      revisionId: "verify-version-diff",
    },
  });

  const challenge = await readScenario("challenge");
  const challengeRevision = revision(challenge);
  assert.equal(challengeRevision.artifactId, "diff-result");
  const challengeValue = valueObject(challengeRevision.next.value);
  const v2ToV3 = challengeValue.v2ToV3 as Record<string, unknown>;
  assert.deepEqual(v2ToV3.added, ["A-600"]);
  assert.deepEqual(v2ToV3.removed, ["A-200"]);
  assert.deepEqual(v2ToV3.changed, []);
  assert.match(String(challengeValue.identityCheck), /A-200.*A-600/);
  assert.deepEqual(challenge.completionValidation, {
    kind: "event",
    type: "artifact.verified",
    match: {
      artifactId: "diff-result",
      revisionId: "verify-version-diff",
    },
  });
});
