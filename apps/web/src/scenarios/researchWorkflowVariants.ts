import type { Scenario, TrainingStep, Validation } from "../types/training";

interface ModeVariant {
  id: string;
  mode: "explore" | "challenge";
  title: string;
  description: string;
  estimatedMinutes: number;
  points: number;
  steps: TrainingStep[];
  exploreTargets?: string[];
  completionValidation?: Validation;
  solutionComparison?: string[];
}

function createModeVariant(base: Scenario, variant: ModeVariant): Scenario {
  const {
    exploreTargets: _exploreTargets,
    completionValidation: _completionValidation,
    solutionComparison: _solutionComparison,
    timeLimitSeconds: _timeLimitSeconds,
    ...shared
  } = base;
  return { ...shared, ...variant };
}

const exploreStep: TrainingStep = {
  id: "explore-research",
  title: "Rechercheflächen frei untersuchen",
  description:
    "Erkunde, wie simulierte Web-/MCP-Suchläufe, Ergebnisartefakt, Iteration, Quellenprüfung und Transfer zusammenhängen.",
  instruction:
    "Untersuche Rechercheprotokoll, Vergleichstabelle und alle drei Quellentypen in eigener Reihenfolge. Für den Abschluss musst du beide tatsächlichen Mängel markieren, die Kontrollquelle unverändert lassen und anschließend in Copilot eine Quellenklassifikation mit Empfehlung formulieren.",
  why: "Explore baut ein mentales Modell des gesamten Workflows auf, ohne die fachliche Prüfpflicht zu umgehen.",
  helpLevels: [
    "Beginne beim Rechercheprotokoll und der Vergleichstabelle.",
    "Prüfe Herstellerdokumentation, Community-Beitrag und offiziellen Blog auf Zahl, Frische und Belegwirkung.",
    "Markiere den Zahlenwiderspruch in Quelle A und die veraltete Community-Quelle B, nicht Quelle C. Formuliere danach in Copilot eine Einordnung aller drei Quellentypen mit Empfehlung.",
  ],
  successMessage: "Der Recherche-Workflow wurde einschließlich Quellenprüfung und Transfer untersucht.",
};

const challengeStep: TrainingStep = {
  id: "verify-research",
  title: "Recherche ohne Klickführung absichern",
  description: "Bewertet wird der belastbare Endzustand und nicht eine vorgegebene Reihenfolge.",
  instruction:
    "Führe alle drei simulierten Suchläufe aus, ergänze die Kosten, prüfe alle drei Quellen, markiere nur die beiden tatsächlichen Mängel und formuliere in Copilot eine Quellenklassifikation mit begründeter Empfehlung.",
  why: "Eine belastbare Recherche braucht nachvollziehbare Arbeitsschritte, Iteration, selektive Quellenprüfung und eine begründete Transferentscheidung.",
  helpLevels: [
    "Achte auf Rechercheprotokoll, Vergleichstabelle, Quellen und die abschließende Einordnung.",
    "Alle vier Revisionen müssen angewendet sein; genau Quelle A und B tragen die eingebauten Mängel.",
    "Quelle A widerspricht der Tabelle numerisch, Quelle B ist veraltet, Quelle C ist die belastbare Kontrollquelle. Nenne anschließend Herstellerdokumentation, offiziellen Blog und Community-Beitrag in einer begründeten Empfehlung im Copilot Chat.",
  ],
  successMessage: "Die Recherche ist nachvollziehbar iteriert, korrekt geprüft und begründet eingeordnet.",
};

const transferValidation: Validation[] = [
  {
    kind: "state",
    selector: "copilot.prompt.last",
    includesAny: ["Herstellerdokumentation", "Hersteller"],
  },
  {
    kind: "state",
    selector: "copilot.prompt.last",
    includesAny: ["offizieller Blog", "offiziellen Blog", "Blog"],
  },
  {
    kind: "state",
    selector: "copilot.prompt.last",
    includesAny: ["Community-Beitrag", "Community"],
  },
  {
    kind: "state",
    selector: "copilot.prompt.last",
    includesAny: ["Empfehlung", "empfehle", "Vorgehen"],
  },
];

const researchCompletion: Validation = {
  kind: "all",
  of: [
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "search-1" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "search-2" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "search-3" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "add-costs" },
    { kind: "state", selector: "artifact.verifiedIds", includes: "source-a" },
    { kind: "state", selector: "artifact.verifiedIds", includes: "source-b" },
    { kind: "state", selector: "artifact.verifiedIds", excludes: "source-c" },
    { kind: "state", selector: "artifact.active.id", equals: "source-c" },
    ...transferValidation,
  ],
};

export function createResearchWorkflowVariants(base: Scenario): [Scenario, Scenario] {
  return [
    createModeVariant(base, {
      id: "research-workflow.explore",
      mode: "explore",
      title: "Recherche-Workflow frei erkunden",
      description:
        "Untersuche die deterministisch simulierte Web-/MCP-Recherche frei; der Abschluss verlangt trotzdem beide Quellenmängel und eine begründete Transferempfehlung.",
      estimatedMinutes: 12,
      points: 90,
      exploreTargets: [
        "artifact.preview.panel",
        "artifact.preview.selector",
        "artifact.preview.data",
        "artifact.preview.table",
        "artifact.preview.applyRevision",
        "artifact.preview.verify",
        "copilot.chat.prompt",
      ],
      completionValidation: researchCompletion,
      steps: [exploreStep],
    }),
    createModeVariant(base, {
      id: "research-workflow.challenge",
      mode: "challenge",
      title: "Challenge: Recherche belastbar machen",
      description:
        "Führe die simulierten Suchläufe aus, ergänze Kosten, finde den Zahlenwiderspruch und die veraltete Quelle und leite eine begründete Empfehlung ab.",
      estimatedMinutes: 12,
      points: 280,
      completionValidation: researchCompletion,
      solutionComparison: [
        "Drei simulierte Suchläufe sichtbar ausgeführt",
        "Vergleichstabelle um Kosten ergänzt",
        "Quelle A: 90 % in der Tabelle widersprechen 80 % in der Herstellerdokumentation",
        "Quelle B: Community-Beitrag von 2023 als veraltet markiert",
        "Quelle C: aktueller offizieller Blog nicht fälschlich als Mangel markiert",
        "Herstellerdokumentation, offizieller Blog und Community-Beitrag klassifiziert und begründete Empfehlung formuliert",
      ],
      steps: [challengeStep],
    }),
  ];
}
