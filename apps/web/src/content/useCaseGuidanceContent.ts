export type UseCaseGuidanceCategory = "development" | "research" | "document" | "workflow";

export type UseCaseGuidanceModule = {
  scenarioId: string;
  label: string;
};

export type UseCaseGuidanceRule = {
  id: UseCaseGuidanceCategory;
  title: string;
  keywords: readonly string[];
  rationale: string;
  modules: readonly UseCaseGuidanceModule[];
  checklist: readonly string[];
};

export const useCaseGuidanceRules: readonly UseCaseGuidanceRule[] = [
  {
    id: "development",
    title: "Kontrollierter KI-Entwicklungsworkflow",
    keywords: ["code", "software", "entwick", "repository", "github", "vscode", "vs code", "terminal"],
    rationale:
      "Dein Ziel ist Entwicklungsarbeit. KI sollte Änderungen in kleinen, überprüfbaren Schritten vorbereiten; Diff, Berechtigungen und Tests bleiben deine Kontrollpunkte.",
    modules: [
      { scenarioId: "copilot-basics.guided", label: "GitHub Copilot – Guided" },
      { scenarioId: "developer-workflow-basics.explore", label: "KI-Entwicklungsworkflow – Explore" },
    ],
    checklist: [
      "Voraussetzungen: Repository, Entwicklungsumgebung und Testweg sind verfügbar.",
      "Abhängigkeiten: gewünschter Endzustand und betroffene Dateien oder Systeme sind abgegrenzt.",
      "Zugriffe: Schreibrechte und externe Werkzeuge sind ausdrücklich erlaubt.",
      "Vertraulichkeit: Geheimnisse, Kundendaten und interne Inhalte bleiben außerhalb unzulässiger Tools.",
      "Prüfschritt: Diff, Tests und Berechtigungen werden vor Übernahme kontrolliert.",
      "Abbruchkriterium: stoppen, wenn die KI außerhalb des vereinbarten Scopes ändern will oder Tests nicht erklärbar fehlschlagen.",
    ],
  },
  {
    id: "research",
    title: "Recherche mit Quellenprüfung",
    keywords: ["recherch", "quelle", "wissen", "vergleich", "information", "regel", "markt"],
    rationale:
      "Bei Recherche zählt nicht nur die Antwort, sondern die nachvollziehbare Trennung zwischen Fundstelle, Bewertung und Schlussfolgerung.",
    modules: [{ scenarioId: "research-workflow.guided", label: "Mit KI recherchieren – Guided" }],
    checklist: [
      "Voraussetzungen: Fragestellung, Zeitraum und zulässige Quellen sind festgelegt.",
      "Abhängigkeiten: benötigte interne Referenzen oder Fachvorgaben liegen vor.",
      "Zugriffe: nur freigegebene Such- und Wissenssysteme verwenden.",
      "Vertraulichkeit: keine internen Inhalte in nicht freigegebene Recherchewerkzeuge übertragen.",
      "Prüfschritt: kritische Aussagen gegen Primärquellen oder belastbare Zweitquellen prüfen.",
      "Abbruchkriterium: stoppen, wenn zentrale Aussagen nicht belegt oder Quellen nicht prüfbar sind.",
    ],
  },
  {
    id: "document",
    title: "Dokumentarbeit mit klarer Freigabegrenze",
    keywords: ["dokument", "bericht", "text", "word", "präsent", "zusammenfass", "protokoll"],
    rationale:
      "KI kann Entwurf und Überarbeitung beschleunigen. Fakten, Freigaben und vertrauliche Inhalte bleiben dabei unter menschlicher Kontrolle.",
    modules: [{ scenarioId: "research-workflow.explore", label: "Quellen und Prüfung – Explore" }],
    checklist: [
      "Voraussetzungen: Zielgruppe, Zweck und verbindliches Ausgabeformat sind geklärt.",
      "Abhängigkeiten: fachliche Quellen, Vorlagen und Freigabevorgaben liegen vor.",
      "Zugriffe: nur freigegebene Dokument- und KI-Werkzeuge verwenden.",
      "Vertraulichkeit: personenbezogene und vertrauliche Inhalte vor Tool-Nutzung einstufen.",
      "Prüfschritt: Fakten, Namen, Zahlen, Ton und Freigabestatus vor Weitergabe kontrollieren.",
      "Abbruchkriterium: stoppen, wenn der Entwurf nicht zuverlässig gegen Quellen oder Vorgaben geprüft werden kann.",
    ],
  },
  {
    id: "workflow",
    title: "Kleinen KI-Pilot mit Prüfschritt aufsetzen",
    keywords: ["prozess", "ablauf", "automatis", "workflow", "e-mail", "email", "anfrage"],
    rationale:
      "Für einen wiederkehrenden Ablauf ist ein begrenzter Pilot mit eindeutigem Eingang, Ergebnis und menschlichem Prüfschritt sinnvoller als sofortige Vollautomatisierung.",
    modules: [{ scenarioId: "developer-workflow-basics.explore", label: "KI-Workflow – Explore" }],
    checklist: [
      "Voraussetzungen: Eingang, gewünschtes Ergebnis und wiederkehrender Arbeitsschritt sind beschrieben.",
      "Abhängigkeiten: beteiligte Systeme und verantwortliche Stellen sind benannt.",
      "Zugriffe: erforderliche Konten, APIs oder Freigaben zuerst mit IT beziehungsweise Fachverantwortlichen klären.",
      "Vertraulichkeit: Test zunächst mit unkritischen Beispieldaten durchführen.",
      "Prüfschritt: ein Mensch prüft das Ergebnis vor Versand, Buchung oder sonstiger Außenwirkung.",
      "Abbruchkriterium: stoppen, sobald die KI eine nicht freigegebene Aktion oder Systemgrenze überschreiten müsste.",
    ],
  },
];
