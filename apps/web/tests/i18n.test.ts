import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localizeScenarioContent } from "../src/i18n/scenarioContent.ts";
import { normalizeLanguage, platformMessage, resolveLocalizedText } from "../src/i18n/messages.ts";
import { getScenario } from "../src/scenarios/index.ts";

describe("i18n language foundation", () => {
  it("normalizes supported language variants and falls back visibly to German", () => {
    assert.equal(normalizeLanguage("en-US"), "en");
    assert.equal(normalizeLanguage("de-DE"), "de");
    assert.equal(normalizeLanguage("fr"), "de");
    assert.equal(normalizeLanguage(null), "de");
  });

  it("resolves localized content with German fallback", () => {
    assert.equal(resolveLocalizedText({ de: "Hallo", en: "Hello" }, "en"), "Hello");
    assert.equal(resolveLocalizedText({ de: "Hallo" }, "en"), "Hallo");
    assert.equal(resolveLocalizedText("Bestehender Inhalt", "en"), "Bestehender Inhalt");
  });

  it("keeps platform keys available in both initial languages", () => {
    assert.equal(platformMessage("de", "changeLanguage"), "Sprache wechseln");
    assert.equal(platformMessage("en", "changeLanguage"), "Change language");
  });

  it("stores scenario copy per language and falls back field-by-field to German", () => {
    const scenario = getScenario("vscode-basics.guided");
    assert.ok(scenario);

    const english = localizeScenarioContent(scenario, "en");
    assert.equal(english.title, "Visual Studio Code – Guided Basics");
    assert.equal(english.steps.find(({ id }) => id === "open_explorer")?.title, "Open Explorer");
    assert.equal(
      english.steps.find(({ id }) => id === "open_folder")?.title,
      scenario.steps.find(({ id }) => id === "open_folder")?.title,
    );
    assert.deepEqual(english.steps[0]?.validation, scenario.steps[0]?.validation);

    assert.equal(localizeScenarioContent(scenario, "de"), scenario);
  });
});
