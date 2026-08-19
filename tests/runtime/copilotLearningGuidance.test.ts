import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveCopilotProductProfile } from "../../apps/web/src/runtime/copilotProductProfile.ts";

type ExploreStep = {
  id: string;
  description: string;
  instruction: string;
  why?: string;
};

type ExploreScenario = {
  exploreTargets?: string[];
  resources?: Array<{ url: string }>;
  steps: ExploreStep[];
};

const exploreScenario = JSON.parse(
  readFileSync(
    new URL("../../content/scenarios/copilot-basics.explore.json", import.meta.url),
    "utf8",
  ),
) as ExploreScenario;

function requireExploreStep(): ExploreStep {
  const step = exploreScenario.steps.find(({ id }) => id === "explore-copilot-surface");
  assert.ok(step, "copilot-basics.explore requires explore-copilot-surface");
  return step;
}

test("Copilot quick tip is contextual to the actual chat prompt surface", () => {
  const exploreStep = requireExploreStep();

  assert.ok(exploreScenario.exploreTargets?.includes("copilot.chat.prompt"));
  assert.match(exploreStep.description, /Gut zu wissen:/i);
  assert.match(exploreStep.description, /Shift \+ Enter/i);
  assert.match(exploreStep.description, /Enter.*send/i);
});

test("Copilot guidance teaches situational mode choice without safety guarantees", () => {
  const exploreStep = requireExploreStep();

  assert.match(exploreStep.instruction, /Ask.*(?:verstehen|erklär)/i);
  assert.match(exploreStep.instruction, /Plan.*(?:strukturier|prüf)/i);
  assert.match(exploreStep.instruction, /Agent.*(?:mehrstufig|Werkzeug|Änderung)/i);

  const profile = resolveCopilotProductProfile({
    productId: "github-copilot",
    hostProductId: "vscode",
    version: "2026.08",
  });
  const descriptions = profile.chatModes.map(({ description }) => description).join(" ");
  const agentDescription = profile.chatModes.find(({ id }) => id === "agent")?.description ?? "";

  assert.doesNotMatch(descriptions, /niemals|garantiert|ohne (?:jede |jegliche )?Änderung/i);
  assert.match(agentDescription, /Berechtigung/i);
  assert.match(agentDescription, /Freigabe/i);
  assert.match(agentDescription, /Ergebnisprüfung/i);
});

test("model-selection heuristic covers stable criteria and keeps volatile details in maintained data", () => {
  const guidance = requireExploreStep().why ?? "";
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
  assert.match(guidance, /Verfügbarkeit.*Abrechnung.*Produktversion.*Plan/i);
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
});
