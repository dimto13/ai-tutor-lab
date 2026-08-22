export type UseCaseGuidanceInput = {
  goal: string;
  tools: string;
  constraints: string;
};

export type UseCaseRecommendation = {
  title: string;
  rationale: string;
  nextSteps: readonly string[];
};

export type UseCaseGuidanceResult =
  | { kind: "clarify"; question: string }
  | { kind: "recommendation"; recommendation: UseCaseRecommendation };

const normalize = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const word = (source: string) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${source})(?=$|[^\\p{L}\\p{N}_])`, "iu");
const vagueGoalPattern =
  /^(?:e-?mails?|texte?|daten|code|recherche|dokumente?|automatisierung)[\s.!?,;:]*$/iu;
const researchPattern = word(
  "recherch[\\p{L}\\p{N}_]*|quelle[\\p{L}\\p{N}_]*|wissen|vergleich[\\p{L}\\p{N}_]*|information[\\p{L}\\p{N}_]*",
);
const documentPattern = word(
  "dokument[\\p{L}\\p{N}_]*|bericht[\\p{L}\\p{N}_]*|text|word|präsent[\\p{L}\\p{N}_]*|zusammenfass[\\p{L}\\p{N}_]*",
);
const developmentPattern = word(
  "code|software|entwick[\\p{L}\\p{N}_]*|repository|github|vs\\s?code|vscode|terminal",
);

export function evaluateUseCaseGuidance(input: UseCaseGuidanceInput): UseCaseGuidanceResult {
  const goal = normalize(input.goal);
  const tools = normalize(input.tools);
  const constraints = normalize(input.constraints);

  if (!goal || vagueGoalPattern.test(goal)) {
    return {
      kind: "clarify",
      question: "Welches konkrete Arbeitsergebnis möchtest du mit KI erreichen?",
    };
  }
  if (!tools) {
    return {
      kind: "clarify",
      question: "Welche Werkzeuge oder Systeme nutzt du für diese Aufgabe heute?",
    };
  }
  if (!constraints) {
    return {
      kind: "clarify",
      question:
        "Welche Vorgaben sind wichtig, zum Beispiel Datenschutz, Freigaben oder erlaubte Systeme?",
    };
  }

  // Classify intent from the requested outcome only. Tools and constraints are context,
  // not evidence for what the user primarily wants to achieve.
  const normalizedGoal = goal.toLocaleLowerCase("de-DE");
  const matches = [
    { kind: "research", matched: researchPattern.test(normalizedGoal) },
    { kind: "document", matched: documentPattern.test(normalizedGoal) },
    { kind: "development", matched: developmentPattern.test(normalizedGoal) },
  ].filter((candidate) => candidate.matched);

  if (matches.length > 1) {
    return {
      kind: "clarify",
      question:
        "Was steht bei deinem Vorhaben im Vordergrund: Recherche, Dokumentarbeit oder Softwareentwicklung?",
    };
  }

  if (matches[0]?.kind === "development") {
    return {
      kind: "recommendation",
      recommendation: {
        title: "Kontrollierter KI-Entwicklungsworkflow",
        rationale:
          "Dein Vorhaben verbindet Entwicklungswerkzeuge mit KI-Unterstützung. Plane deshalb einen überprüfbaren Workflow statt eines autonomen End-to-End-Laufs.",
        nextSteps: [
          "Grenze den gewünschten Endzustand und erlaubte Dateien oder Systeme ein.",
          "Lass Änderungen in kleinen Schritten erzeugen und prüfe Diff sowie Berechtigungen.",
          "Verifiziere den Endzustand mit den vorhandenen Tests und dokumentiere offene Risiken.",
        ],
      },
    };
  }
  if (matches[0]?.kind === "research") {
    return {
      kind: "recommendation",
      recommendation: {
        title: "Recherche mit Quellenprüfung",
        rationale:
          "Für dein Vorhaben ist nicht nur eine schnelle Antwort wichtig, sondern eine nachvollziehbare Trennung zwischen Fundstellen, Bewertung und Schlussfolgerung.",
        nextSteps: [
          "Formuliere Fragestellung, Zeitraum und zulässige Quellen.",
          "Sammle Ergebnisse mit Quellenbezug und markiere Unsicherheiten.",
          "Prüfe kritische Aussagen gegen Primärquellen, bevor du das Ergebnis weiterverwendest.",
        ],
      },
    };
  }
  if (matches[0]?.kind === "document") {
    return {
      kind: "recommendation",
      recommendation: {
        title: "Dokumentarbeit mit klarer Freigabegrenze",
        rationale:
          "KI kann Entwurf und Überarbeitung beschleunigen. Inhalte und Freigaben sollten dabei bewusst in deiner Kontrolle bleiben.",
        nextSteps: [
          "Definiere Zielgruppe, Zweck und verbindliche Vorgaben des Dokuments.",
          "Erzeuge zunächst einen begrenzten Entwurf ohne unnötige vertrauliche Inhalte.",
          "Prüfe Fakten, Ton und Freigabestatus vor Export oder Weitergabe.",
        ],
      },
    };
  }

  return {
    kind: "recommendation",
    recommendation: {
      title: "Kleinen KI-Pilot mit Prüfschritt aufsetzen",
      rationale:
        "Dein Vorhaben lässt sich sinnvoll als begrenzter Pilot testen, ohne daraus vorschnell einen vollautomatischen Prozess zu machen.",
      nextSteps: [
        "Beschreibe einen wiederkehrenden Arbeitsschritt mit eindeutigem Eingang und Ergebnis.",
        "Teste KI-Unterstützung zunächst mit unkritischen Beispieldaten.",
        "Lege fest, was ein Mensch vor der weiteren Verwendung prüfen oder freigeben muss.",
      ],
    },
  };
}
