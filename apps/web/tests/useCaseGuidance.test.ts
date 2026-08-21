import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateUseCaseGuidance } from "../src/domain/useCaseGuidance.ts";

describe("evaluateUseCaseGuidance", () => {
  it("asks a targeted question when the goal is too vague, including punctuation", () => {
    for (const goal of ["E-Mails", "Daten?", "Recherche."]) {
      assert.equal(evaluateUseCaseGuidance({ goal, tools: "Outlook", constraints: "intern" }).kind, "clarify");
    }
  });

  it("accepts concise but concrete goals instead of relying on character length", () => {
    assert.equal(evaluateUseCaseGuidance({ goal: "Python-Skript prüfen", tools: "VS Code", constraints: "nur lokaler Code" }).kind, "recommendation");
  });

  it("requires current tools and constraints before recommending a workflow", () => {
    assert.equal(evaluateUseCaseGuidance({ goal: "Kundenanfragen zusammenfassen", tools: "", constraints: "freigegebene Systeme" }).kind, "clarify");
    assert.equal(evaluateUseCaseGuidance({ goal: "Kundenanfragen zusammenfassen", tools: "Outlook", constraints: "" }).kind, "clarify");
  });

  it("maps development work to a controlled workflow", () => {
    const result = evaluateUseCaseGuidance({ goal: "Softwareänderungen mit KI entwickeln", tools: "VS Code und GitHub", constraints: "prüfen und testen" });
    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation") assert.equal(result.recommendation.title, "Kontrollierter KI-Entwicklungsworkflow");
  });

  it("maps research work to source verification", () => {
    const result = evaluateUseCaseGuidance({ goal: "Informationen zu neuen Regeln recherchieren", tools: "Websuche", constraints: "belastbare Quellen" });
    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation") assert.equal(result.recommendation.title, "Recherche mit Quellenprüfung");
  });

  it("recognizes German words with umlauts without relying on ASCII word boundaries", () => {
    const result = evaluateUseCaseGuidance({ goal: "Präsentationen für Schulungen zusammenfassen", tools: "PowerPoint", constraints: "intern" });
    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation") assert.equal(result.recommendation.title, "Dokumentarbeit mit klarer Freigabegrenze");
  });

  it("classifies intent from the goal rather than tools or constraints", () => {
    const result = evaluateUseCaseGuidance({ goal: "Abläufe zwischen Systemen vorbereiten", tools: "VS Code und Word", constraints: "Quellen und Code bleiben intern" });
    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation") assert.equal(result.recommendation.title, "Kleinen KI-Pilot mit Prüfschritt aufsetzen");
  });

  it("asks for the primary intent when multiple use-case families occur in the goal", () => {
    const result = evaluateUseCaseGuidance({ goal: "Quellen recherchieren und daraus einen Bericht erstellen", tools: "Websuche und Word", constraints: "freigegebene Quellen" });
    assert.equal(result.kind, "clarify");
  });

  it("normalizes whitespace and treats missing runtime strings defensively", () => {
    const malformed = { goal: undefined, tools: "Outlook", constraints: "intern" } as unknown as { goal: string; tools: string; constraints: string };
    assert.equal(evaluateUseCaseGuidance(malformed).kind, "clarify");
    assert.equal(evaluateUseCaseGuidance({ goal: "  Informationen   recherchieren  ", tools: " Websuche ", constraints: " intern " }).kind, "recommendation");
  });

  it("does not require or expose persistence identifiers", () => {
    const result = evaluateUseCaseGuidance({ goal: "wiederkehrenden Prozess mit KI unterstützen", tools: "Browser", constraints: "keine Daten speichern" });
    assert.doesNotMatch(JSON.stringify(result), /user|tenant|session|persist|telemetr/i);
  });
});
