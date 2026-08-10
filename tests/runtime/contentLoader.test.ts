import assert from "node:assert/strict";
import test from "node:test";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";

function scenarioWithSeed(seed: Record<string, unknown>) {
  return {
    id: "seed-schema-test",
    mode: "guided",
    title: "Seed schema test",
    description: "",
    environment: {
      productId: "vscode",
      version: "1.x",
      runtimeAdapterId: "vscode-simulator",
      seed,
    },
    steps: [
      {
        id: "step-1",
        title: "Test step",
        description: "",
        instruction: "Do the test action.",
        why: "",
        helpLevels: ["", "", ""],
        successMessage: "Done.",
      },
    ],
  };
}

test("content loader accepts typed Copilot seed templates alongside arbitrary runtime seed fields", () => {
  assert.doesNotThrow(() =>
    parseScenario(
      scenarioWithSeed({
        workspaceMode: "folder",
        inlineSuggestions: [
          {
            file: "example.py",
            whenContentEquals: "def multiply(a, b):\n",
            text: "    return a * b\n",
          },
        ],
        chatResponses: [
          {
            file: "example.py",
            promptContains: "multipl",
            response: "def multiply(a, b):\n    return a * b",
          },
        ],
      }),
    ),
  );
});

test("content loader rejects misspelled Copilot seed template fields", () => {
  assert.throws(() =>
    parseScenario(
      scenarioWithSeed({
        inlineSuggestions: [
          {
            file: "example.py",
            whenContentEqual: "def multiply(a, b):\n",
            text: "    return a * b\n",
          },
        ],
      }),
    ),
  );
});

test("content loader rejects incomplete or empty Copilot seed templates", () => {
  assert.throws(() =>
    parseScenario(
      scenarioWithSeed({
        inlineSuggestions: [{ file: "example.py" }],
      }),
    ),
  );

  assert.throws(() =>
    parseScenario(
      scenarioWithSeed({
        chatResponses: [{ promptContains: "", response: "answer" }],
      }),
    ),
  );
});

test("content loader rejects whitespace-only Copilot seed matchers", () => {
  assert.throws(() =>
    parseScenario(
      scenarioWithSeed({
        inlineSuggestions: [{ file: "   ", text: "return 1\n" }],
      }),
    ),
  );

  assert.throws(() =>
    parseScenario(
      scenarioWithSeed({
        chatResponses: [{ file: "example.py", promptContains: "   ", response: "answer" }],
      }),
    ),
  );
});

test("content loader derives runtime adapter ids from version-pinned integrations", () => {
  const baseScenario = scenarioWithSeed({});
  const integrations = [
    {
      productId: "github-copilot",
      version: "2026.08",
      runtimeAdapterId: "github-copilot-vscode-simulator",
    },
  ];

  const parsed = parseScenario({
    ...baseScenario,
    environment: {
      ...baseScenario.environment,
      integrations,
    },
  });

  assert.deepEqual(parsed.environment?.integrations, integrations);
  assert.deepEqual(parsed.environment?.integrationRuntimeAdapterIds, [
    "github-copilot-vscode-simulator",
  ]);
});

test("content loader rejects legacy authored integrationRuntimeAdapterIds", () => {
  const scenario = scenarioWithSeed({});

  assert.throws(() =>
    parseScenario({
      ...scenario,
      environment: {
        ...scenario.environment,
        integrationRuntimeAdapterIds: ["github-copilot-vscode-simulator"],
      },
    }),
  );
});

test("content loader accepts safe artifact preview data and rejects executable HTML", () => {
  assert.doesNotThrow(() =>
    parseScenario(
      scenarioWithSeed({
        artifactPreview: {
          artifacts: [
            {
              id: "safe-page",
              type: "html",
              title: "Safe page",
              html: "<section><h1>Safe</h1><p>Validated content</p></section>",
            },
          ],
        },
      }),
    ),
  );

  assert.throws(() =>
    parseScenario(
      scenarioWithSeed({
        artifactPreview: {
          artifacts: [
            {
              id: "unsafe-page",
              type: "html",
              title: "Unsafe page",
              html: "<script>globalThis.compromised = true</script>",
            },
          ],
        },
      }),
    ),
  );
});

test("content loader accepts sequence and any validators from declarative content", () => {
  const baseScenario = scenarioWithSeed({});
  const parsed = parseScenario({
    ...baseScenario,
    steps: [
      {
        ...baseScenario.steps[0],
        validation: {
          kind: "sequence",
          ordered: true,
          of: [
            { kind: "event", type: "file.opened" },
            {
              kind: "any",
              of: [
                { kind: "event", type: "editor.selection.changed" },
                { kind: "event", type: "file.updated" },
              ],
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(parsed.steps[0]?.validation, {
    kind: "sequence",
    ordered: true,
    of: [
      { kind: "event", type: "file.opened" },
      {
        kind: "any",
        of: [
          { kind: "event", type: "editor.selection.changed" },
          { kind: "event", type: "file.updated" },
        ],
      },
    ],
  });
});

test("content loader resolves reusable introduction steps before authored guided steps", () => {
  const parsed = parseScenario({
    ...scenarioWithSeed({}),
    audience: {
      personaId: "non-programmer",
      glossaryConcepts: ["vscode.activity_bar", "vscode.side_bar"],
      introductionStepRefs: ["vscode.ui.activity-bar", "vscode.ui.side-bar"],
    },
  });

  assert.deepEqual(
    parsed.steps.slice(0, 3).map((step) => step.id),
    ["vscode.ui.activity-bar", "vscode.ui.side-bar", "step-1"],
  );
  assert.deepEqual(parsed.audience?.introductionStepIds, [
    "vscode.ui.activity-bar",
    "vscode.ui.side-bar",
  ]);
  assert.equal(parsed.steps[0]?.stepType, "explanation");
  assert.equal(parsed.steps[0]?.optional, true);
});

test("content loader rejects unknown shared introduction references", () => {
  assert.throws(() =>
    parseScenario({
      ...scenarioWithSeed({}),
      audience: {
        personaId: "non-programmer",
        glossaryConcepts: ["vscode.activity_bar"],
        introductionStepRefs: ["vscode.ui.does-not-exist"],
      },
    }),
  );
});

test("content loader keeps shared introductions out of challenge semantics", () => {
  assert.throws(() =>
    parseScenario({
      ...scenarioWithSeed({}),
      mode: "challenge",
      audience: {
        personaId: "non-programmer",
        glossaryConcepts: ["vscode.activity_bar"],
        introductionStepRefs: ["vscode.ui.activity-bar"],
      },
      completionValidation: {
        kind: "state",
        selector: "workspace.mode",
        equals: "folder",
      },
    }),
  );
});
