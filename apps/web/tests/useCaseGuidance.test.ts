import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateUseCaseGuidance, formatTaskDraft } from "../src/domain/useCaseGuidance.ts";

describe("evaluateUseCaseGuidance", () => {
  it("asks a targeted question when the goal is too vague, including punctuation", () => {
    for (const goal of ["E-Mails", "Daten?", "Recherche."]) {
      assert.equal(
        evaluateUseCaseGuidance({ goal, tools: "Outlook", constraints: "intern" }).kind,
        "clarify",
      );
    }
  });

  it("accepts concise but concrete goals instead of relying on character length", () => {
    assert.equal(
      evaluateUseCaseGuidance({
        goal: "Python-Skript prüfen",
        tools: "VS Code",
        constraints: "nur lokaler Code",
      }).kind,
      "recommendation",
    );
  });

  it("requires current tools and constraints before recommending a workflow", () => {
    assert.equal(
      evaluateUseCaseGuidance({
        goal: "Kundenanfragen zusammenfassen",
        tools: "",
        constraints: "freigegebene Systeme",
      }).kind,
      "clarify",
    );
    assert.equal(
      evaluateUseCaseGuidance({
        goal: "Kundenanfragen zusammenfassen",
        tools: "Outlook",
        constraints: "",
      }).kind,
      "clarify",
    );
  });

  const cases = [
    {
      goal: "Softwareänderungen mit KI entwickeln",
      tools: "VS Code und GitHub",
      constraints: "prüfen und testen",
      title: "Kontrollierter KI-Entwicklungsworkflow",
    },
    {
      goal: "Informationen zu neuen Regeln recherchieren",
      tools: "Websuche",
      constraints: "belastbare Quellen",
      title: "Recherche mit Quellenprüfung",
    },
    {
      goal: "Präsentationen für Schulungen zusammenfassen",
      tools: "PowerPoint",
      constraints: "intern",
      title: "Dokumentarbeit mit klarer Freigabegrenze",
    },
  ] as const;

  it("maps at least three maintained use-case families to deterministic recommendations", () => {
    for (const useCase of cases) {
      const result = evaluateUseCaseGuidance(useCase);
      assert.equal(result.kind, "recommendation");
      if (result.kind !== "recommendation") continue;
      assert.equal(result.recommendation.title, useCase.title);
      assert.ok(result.recommendation.modules.length > 0);
      assert.equal(result.recommendation.checklist.length, 6);
    }
  });

  it("builds the reusable six-field task draft and keeps unknown details visibly open", () => {
    const result = evaluateUseCaseGuidance(cases[0]);
    assert.equal(result.kind, "recommendation");
    if (result.kind !== "recommendation") return;

    const formatted = formatTaskDraft(result.recommendation.taskDraft);
    for (const field of [
      "Ziel:",
      "Ausgangslage:",
      "Eingaben:",
      "Ergebnisformat:",
      "Randbedingungen:",
      "Prüfkriterium:",
    ]) {
      assert.match(formatted, new RegExp(field));
    }
    assert.match(formatted, /\[hier ergänzen:/);
  });

  it("keeps checklists specific to the selected use-case family", () => {
    const development = evaluateUseCaseGuidance(cases[0]);
    const research = evaluateUseCaseGuidance(cases[1]);
    assert.equal(development.kind, "recommendation");
    assert.equal(research.kind, "recommendation");
    if (development.kind !== "recommendation" || research.kind !== "recommendation") return;
    assert.notDeepEqual(development.recommendation.checklist, research.recommendation.checklist);
  });

  it("classifies intent from the goal rather than tools or constraints", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Abläufe zwischen Systemen vorbereiten",
      tools: "VS Code und Word",
      constraints: "Quellen und Code bleiben intern",
    });
    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation")
      assert.equal(result.recommendation.title, "Kleinen KI-Pilot mit Prüfschritt aufsetzen");
  });

  it("asks for the primary intent when multiple use-case families occur in the goal", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Quellen recherchieren und daraus einen Bericht erstellen",
      tools: "Websuche und Word",
      constraints: "freigegebene Quellen",
    });
    assert.equal(result.kind, "clarify");
  });

  it("normalizes whitespace and treats missing runtime strings defensively", () => {
    const malformed = { goal: undefined, tools: "Outlook", constraints: "intern" } as unknown as {
      goal: string;
      tools: string;
      constraints: string;
    };
    assert.equal(evaluateUseCaseGuidance(malformed).kind, "clarify");
    assert.equal(
      evaluateUseCaseGuidance({
        goal: "  Informationen   recherchieren  ",
        tools: " Websuche ",
        constraints: " intern ",
      }).kind,
      "recommendation",
    );
  });

  it("does not require or expose persistence identifiers", () => {
    const result = evaluateUseCaseGuidance({
      goal: "wiederkehrenden Prozess mit KI unterstützen",
      tools: "Browser",
      constraints: "keine Daten speichern",
    });
    assert.doesNotMatch(JSON.stringify(result), /user|tenant|session|persist|telemetr/i);
  });
});
