import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateUseCaseGuidance } from "../src/domain/useCaseGuidance.ts";

describe("evaluateUseCaseGuidance", () => {
  it("asks a targeted question when the goal is too vague", () => {
    assert.deepEqual(
      evaluateUseCaseGuidance({ goal: "E-Mails", tools: "Outlook", constraints: "intern" }),
      {
        kind: "clarify",
        question: "Welches konkrete Arbeitsergebnis möchtest du mit KI erreichen?",
      },
    );
  });

  it("accepts concise but concrete goals instead of relying on character length", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Python-Skript prüfen",
      tools: "VS Code",
      constraints: "nur lokaler Code",
    });
    assert.equal(result.kind, "recommendation");
  });

  it("requires current tools and constraints before recommending a workflow", () => {
    const missingTools = evaluateUseCaseGuidance({
      goal: "Ich möchte Kundenanfragen schneller zusammenfassen",
      tools: "",
      constraints: "nur freigegebene Systeme",
    });
    assert.equal(missingTools.kind, "clarify");
    if (missingTools.kind === "clarify") assert.match(missingTools.question, /Werkzeuge/);

    const missingConstraints = evaluateUseCaseGuidance({
      goal: "Ich möchte Kundenanfragen schneller zusammenfassen",
      tools: "Outlook und Word",
      constraints: "",
    });
    assert.equal(missingConstraints.kind, "clarify");
    if (missingConstraints.kind === "clarify")
      assert.match(missingConstraints.question, /Vorgaben/);
  });

  it("maps development work to a controlled workflow", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte kleine Softwareänderungen mit KI vorbereiten",
      tools: "VS Code und GitHub",
      constraints: "Änderungen müssen geprüft und getestet werden",
    });

    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation") {
      assert.equal(result.recommendation.title, "Kontrollierter KI-Entwicklungsworkflow");
      assert.ok(result.recommendation.nextSteps.some((step) => step.includes("Diff")));
    }
  });

  it("maps research work to source verification", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte Informationen zu neuen Regeln recherchieren",
      tools: "Websuche und interne Wissensbasis",
      constraints: "nur belastbare Quellen verwenden",
    });

    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation") {
      assert.equal(result.recommendation.title, "Recherche mit Quellenprüfung");
      assert.ok(result.recommendation.nextSteps.some((step) => step.includes("Primärquellen")));
    }
  });

  it("does not misclassify substrings such as Kontext as document work", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte Abläufe zwischen Systemen besser vorbereiten",
      tools: "Browser",
      constraints: "Kontext bleibt intern",
    });
    assert.equal(result.kind, "recommendation");
    if (result.kind === "recommendation") {
      assert.equal(result.recommendation.title, "Kleinen KI-Pilot mit Prüfschritt aufsetzen");
    }
  });

  it("asks for the primary intent when multiple use-case families match", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte Quellen recherchieren und daraus einen Bericht erstellen",
      tools: "Websuche und Word",
      constraints: "nur freigegebene Quellen",
    });
    assert.equal(result.kind, "clarify");
    if (result.kind === "clarify") assert.match(result.question, /im Vordergrund/);
  });

  it("normalizes whitespace and treats missing runtime strings defensively", () => {
    const malformed = { goal: undefined, tools: "Outlook", constraints: "intern" } as unknown as {
      goal: string;
      tools: string;
      constraints: string;
    };
    assert.equal(evaluateUseCaseGuidance(malformed).kind, "clarify");

    const spaced = evaluateUseCaseGuidance({
      goal: "  Informationen   recherchieren  ",
      tools: " Websuche ",
      constraints: " intern ",
    });
    assert.equal(spaced.kind, "recommendation");
  });

  it("does not require or expose persistence identifiers", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte einen wiederkehrenden Prozess mit KI unterstützen",
      tools: "Browser",
      constraints: "keine Daten speichern und keine externen Dienste",
    });

    assert.doesNotMatch(JSON.stringify(result), /user|tenant|session|persist|telemetr/i);
  });
});
