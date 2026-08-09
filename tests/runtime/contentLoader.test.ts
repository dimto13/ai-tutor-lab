import assert from "node:assert/strict";
import test from "node:test";
import { parseScenario } from "../../src/scenarios/contentLoader.ts";

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
