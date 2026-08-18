import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveCopilotProductProfile } from "../../apps/web/src/runtime/copilotProductProfile.ts";

type ExploreScenario = {
  exploreTargets?: string[];
  resources?: Array<{ url: string }>;
  steps: Array<{
    id: string;
    description: string;
    instruction: string;
    why?: string;
  }>;
};

const exploreScenario = JSON.parse(
  readFileSync(
    new URL("../../content/scenarios/copilot-basics.explore.json", import.meta.url),
    "utf8",
  ),
) as ExploreScenario;

const exploreStep = exploreScenario.steps.find(({ id }) => id === "explore-copilot-surface");

if (!exploreStep) {
  throw new Error("copilot-basics.explore requires explore-copilot-surface");
}

test("Copilot quick tip is contextual to the actual chat prompt surface", () => {
  assert.ok(exploreScenario.exploreTargets?.includes("copilot.chat.prompt"));
  assert.match(exploreStep.description, /Gut zu wissen:/);
  assert.match(exploreStep.description, /Shift \+ Enter/);
  assert.match(exploreStep.description, /Enter sendet/);
});

test("Copilot guidance teaches situational mode choice without safety guarantees", () => {
  assert.match(exploreStep.instruction, /Ask zum Verstehen oder Erklären/);
  assert.match(exploreStep.instruction, /Plan zum Strukturieren und Prüfen/);
  assert.match(exploreStep.instruction, /Agent für mehrstufige Aufgaben/);

  const profile = resolveCopilotProductProfile({
    productId: "github-copilot",
    hostProductId: "vscode",
    version: "2026.08",
  });
  const descriptions = profile.chatModes.map(({ description }) => description).join(" ");

  assert.doesNotMatch(descriptions, /niemals|garantiert|ohne (?:jede |jegliche )?Änderung/i);
  assert.match(descriptions, /Berechtigungen, Freigaben und Ergebnisprüfung/);
});

test(
  "model-selection heuristic covers stable criteria and keeps volatile details in maintained data",
  () => {
    const guidance = exploreStep.why ?? "";
    for (const criterion of [
      "Qualität",
      "Reasoning",
      "Geschwindigkeit",
      "Kontext",
      "Agent-/Werkzeugfähigkeit",
      "Kontingent",
      "Kosten",
      "Unternehmensfreigabe",
      "Auto",
    ]) {
      assert.match(guidance, new RegExp(criterion));
    }
    assert.match(
      guidance,
      /Verfügbarkeit und Abrechnung können sich mit Produktversion und Plan ändern/,
    );
    assert.doesNotMatch(guidance, /OpenAI.*billig|Anthropic.*teuer|universell bestes Modell/i);

    const profile = resolveCopilotProductProfile({
      productId: "github-copilot",
      hostProductId: "vscode",
      version: "2026.08",
    });
    assert.ok(profile.models.some(({ selection }) => selection === "automatic"));
    assert.ok(profile.models.some(({ selection }) => selection === "explicit"));
    assert.ok(profile.sources.some(({ url }) => url.includes("/copilot/reference/ai-models/")));
    assert.ok(profile.sources.some(({ url }) => url.includes("/copilot/concepts/billing")));
    assert.ok(
      exploreScenario.resources?.some(({ url }) => url.includes("/copilot/concepts/billing")),
    );
  },
);
