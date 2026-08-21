import { describe, expect, it } from "vitest";
import { evaluateUseCaseGuidance } from "./useCaseGuidance";

describe("evaluateUseCaseGuidance", () => {
  it("asks a targeted question when the goal is too vague", () => {
    expect(
      evaluateUseCaseGuidance({ goal: "E-Mails", tools: "Outlook", constraints: "intern" }),
    ).toEqual({
      kind: "clarify",
      question: "Welches konkrete Arbeitsergebnis möchtest du mit KI erreichen?",
    });
  });

  it("requires current tools and constraints before recommending a workflow", () => {
    expect(
      evaluateUseCaseGuidance({
        goal: "Ich möchte Kundenanfragen schneller zusammenfassen",
        tools: "",
        constraints: "nur freigegebene Systeme",
      }),
    ).toMatchObject({ kind: "clarify", question: expect.stringContaining("Werkzeuge") });

    expect(
      evaluateUseCaseGuidance({
        goal: "Ich möchte Kundenanfragen schneller zusammenfassen",
        tools: "Outlook und Word",
        constraints: "",
      }),
    ).toMatchObject({ kind: "clarify", question: expect.stringContaining("Vorgaben") });
  });

  it("maps development work to a controlled workflow", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte kleine Softwareänderungen mit KI vorbereiten",
      tools: "VS Code und GitHub",
      constraints: "Änderungen müssen geprüft und getestet werden",
    });

    expect(result).toMatchObject({
      kind: "recommendation",
      recommendation: {
        title: "Kontrollierter KI-Entwicklungsworkflow",
        nextSteps: expect.arrayContaining([expect.stringContaining("Diff")]),
      },
    });
  });

  it("maps research work to source verification", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte Informationen zu neuen Regeln recherchieren",
      tools: "Websuche und interne Wissensbasis",
      constraints: "nur belastbare Quellen verwenden",
    });

    expect(result).toMatchObject({
      kind: "recommendation",
      recommendation: {
        title: "Recherche mit Quellenprüfung",
        nextSteps: expect.arrayContaining([expect.stringContaining("Primärquellen")]),
      },
    });
  });

  it("does not require or expose persistence identifiers", () => {
    const result = evaluateUseCaseGuidance({
      goal: "Ich möchte einen wiederkehrenden Prozess mit KI unterstützen",
      tools: "Browser",
      constraints: "keine Daten speichern und keine externen Dienste",
    });

    expect(JSON.stringify(result)).not.toMatch(/user|tenant|session|persist|telemetr/i);
  });
});
