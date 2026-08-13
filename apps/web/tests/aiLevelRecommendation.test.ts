import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { contentRecommendationForAiLevel } from "../src/profile/aiLevelRecommendation.ts";

const levels = ["beginner", "intermediate", "advanced"] as const;

test("AI level recommendations point to existing scenario content", async () => {
  for (const level of levels) {
    const recommendation = contentRecommendationForAiLevel(level);
    const scenarioUrl = new URL(
      `../../../content/scenarios/${recommendation.scenarioId}.json`,
      import.meta.url,
    );
    await access(scenarioUrl);
  }
});

test("AI level recommendations vary by entry experience", () => {
  const beginner = contentRecommendationForAiLevel("beginner");
  const intermediate = contentRecommendationForAiLevel("intermediate");
  const advanced = contentRecommendationForAiLevel("advanced");

  assert.equal(beginner.scenarioId, "vscode-basics.guided");
  assert.equal(intermediate.scenarioId, "copilot-basics.guided");
  assert.equal(advanced.scenarioId, "copilot-basics.challenge");
  assert.notEqual(beginner.scenarioId, advanced.scenarioId);
});
