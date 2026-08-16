import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getRuntimeReferenceDefinition } from "../../apps/web/src/runtime/referenceCatalog.ts";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";
import type { Validation } from "../../packages/training-engine/src/types.ts";

const engineTypesUrl = new URL("../../packages/training-engine/src/types.ts", import.meta.url);
const engineRecoveryUrl = new URL(
  "../../packages/training-engine/src/guidedRecovery.ts",
  import.meta.url,
);
const runtimeCoreUrl = new URL("../../packages/runtime-core/src/runtimeAdapter.ts", import.meta.url);
const trainingStoreUrl = new URL("../../apps/web/src/state/trainingStore.tsx", import.meta.url);
const vscodeScenarioUrl = new URL(
  "../../content/scenarios/vscode-basics.guided.json",
  import.meta.url,
);

function stateSelectors(validation: Validation): string[] {
  if (validation.kind === "state") return [validation.selector];
  if (validation.kind === "not") return stateSelectors(validation.of);
  if (validation.kind === "all" || validation.kind === "any" || validation.kind === "sequence") {
    return validation.of.flatMap(stateSelectors);
  }
  return [];
}

test("guided recovery keeps product semantics out of training-engine and runtime-core", async () => {
  const [typesSource, recoverySource, runtimeCoreSource, storeSource] = await Promise.all([
    readFile(engineTypesUrl, "utf8"),
    readFile(engineRecoveryUrl, "utf8"),
    readFile(runtimeCoreUrl, "utf8"),
    readFile(trainingStoreUrl, "utf8"),
  ]);

  for (const source of [typesSource, recoverySource, runtimeCoreSource]) {
    assert.doesNotMatch(source, /vscode|notiz\.txt|editor\.activate-file/i);
  }
  assert.doesNotMatch(storeSource, /notiz\.txt|editor\.activate-file/i);
  assert.match(runtimeCoreSource, /recover\?\(command: RuntimeRecoveryCommand\)/);
  assert.match(recoverySource, /statuses:\s*\{ \.\.\.session\.statuses, \[stepId\]: "ACTIVE" \}/);
  assert.doesNotMatch(recoverySource, /score|award|points|completeTrainingStep/i);
});

test("authored recovery rules only query selectors exposed by their scenario runtimes", async () => {
  const raw = JSON.parse(await readFile(vscodeScenarioUrl, "utf8"));
  const scenario = parseScenario(raw);
  const primaryRuntimeId = scenario.environment?.runtimeAdapterId;
  assert.ok(primaryRuntimeId);

  const runtimeIds = [
    primaryRuntimeId,
    ...(scenario.environment?.integrationRuntimeAdapterIds ?? []),
  ];
  const runtimeDefinitions = runtimeIds.map((runtimeId) => {
    const definition = getRuntimeReferenceDefinition(runtimeId);
    assert.ok(definition, `missing runtime definition for ${runtimeId}`);
    return definition;
  });

  for (const step of scenario.steps) {
    for (const rule of step.recovery?.stateRules ?? []) {
      for (const selector of stateSelectors(rule.when)) {
        assert.ok(
          runtimeDefinitions.some((runtime) => runtime.querySelectors.includes(selector)),
          `${scenario.id}/${step.id} recovery selector is not exposed: ${selector}`,
        );
      }
    }

    const actions = [
      ...(step.recovery?.onValidationFailure ? [step.recovery.onValidationFailure] : []),
      ...(step.recovery?.stateRules?.map(({ action }) => action) ?? []),
    ];
    for (const action of actions) {
      if (!action.runtimeAdapterId) continue;
      assert.ok(
        runtimeIds.includes(action.runtimeAdapterId),
        `${scenario.id}/${step.id} recovery targets unrelated runtime ${action.runtimeAdapterId}`,
      );
    }
  }
});