import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLanguage, platformMessage, resolveLocalizedText } from "../src/i18n/messages.ts";

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
});
