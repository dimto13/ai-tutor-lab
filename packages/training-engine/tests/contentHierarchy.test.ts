import assert from "node:assert/strict";
import test from "node:test";
import { validateLearningContentGraph } from "../src/contentHierarchy.ts";
import type { LearningContentGraph } from "../src/contentHierarchy.ts";
import type { Scenario } from "../src/types.ts";

const scenario = {
  id: "copilot-basics.guided",
  moduleId: "copilot-basics",
  mode: "guided",
  title: "Copilot basics",
  description: "",
  steps: [],
} satisfies Scenario;

test("Git/Copilot learning content is representable as curriculum/course/module/scenario", () => {
  const graph: LearningContentGraph = {
    curricula: [{ id: "developer", title: "Developer", courseIds: ["ai-coding"] }],
    courses: [
      {
        id: "ai-coding",
        curriculumId: "developer",
        title: "AI Coding",
        moduleIds: ["copilot-basics"],
      },
    ],
    modules: [
      {
        id: "copilot-basics",
        courseId: "ai-coding",
        title: "Copilot basics",
        learningLayer: "tool",
        scenarioIds: [scenario.id],
      },
    ],
    scenarios: [scenario],
  };

  assert.doesNotThrow(() => validateLearningContentGraph(graph));
});

test("content hierarchy rejects dangling module references", () => {
  const graph: LearningContentGraph = {
    curricula: [{ id: "developer", title: "Developer", courseIds: ["ai-coding"] }],
    courses: [
      {
        id: "ai-coding",
        curriculumId: "developer",
        title: "AI Coding",
        moduleIds: ["missing"],
      },
    ],
    modules: [],
    scenarios: [],
  };

  assert.throws(() => validateLearningContentGraph(graph), /unknown module missing/);
});
