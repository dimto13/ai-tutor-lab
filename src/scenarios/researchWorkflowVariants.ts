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
    "Erkunde, wie Suchläufe, Ergebnisartefakt, Iteration und Quellenprüfung zusammenhängen.",
  instruction:
    "Untersuche Rechercheprotokoll, Vergleichstabelle und Quellen in eigener Reihenfolge.",
  why: "Explore baut ein mentales Modell des gesamten Workflows auf, bevor ein geführter Ablauf folgt.",
  helpLevels: [
    "Beginne beim Rechercheprotokoll.",
    "Probiere Revisionen und Artefakt-Reiter aus.",
    "Öffne auch die drei Quellenartefakte.",
  ],
  successMessage: "Die zentralen Flächen des Recherche-Workflows wurden untersucht.",
};

const challengeStep: TrainingStep = {
  id: "verify-research",
  title: "Recherche ohne Klickführung absichern",
  description: "Bewertet wird der belastbare Endzustand und nicht eine vorgegebene Reihenfolge.",
  instruction:
    "Führe alle drei Suchläufe aus, ergänze die Kosten, prüfe alle drei Quellen und markiere nur die beiden tatsächlichen Mängel.",
  why: "Eine belastbare Recherche braucht nachvollziehbare Arbeitsschritte, Iteration und selektive Quellenprüfung.",
  helpLevels: [
    "Achte auf Rechercheprotokoll, Vergleichstabelle und Quellen.",
    "Alle vier Revisionen müssen angewendet sein.",
    "Quelle A und B haben Mängel; Quelle C ist die belastbare Kontrollquelle.",
  ],
  successMessage: "Die Recherche ist nachvollziehbar iteriert und korrekt geprüft.",
};

const challengeCompletion: Validation = {
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
  ],
};

export function createResearchWorkflowVariants(base: Scenario): [Scenario, Scenario] {
  return [
    createModeVariant(base, {
      id: "research-workflow.explore",
      mode: "explore",
      title: "Recherche-Workflow frei erkunden",
      description:
        "Untersuche Rechercheprotokoll, Vergleichstabelle, Iterationen und Quellenprüfung ohne feste Klickreihenfolge.",
      estimatedMinutes: 10,
      points: 80,
      exploreTargets: [
        "artifact.preview.panel",
        "artifact.preview.selector",
        "artifact.preview.data",
        "artifact.preview.table",
        "artifact.preview.applyRevision",
        "artifact.preview.verify",
      ],
      steps: [exploreStep],
    }),
    createModeVariant(base, {
      id: "research-workflow.challenge",
      mode: "challenge",
      title: "Challenge: Recherche belastbar machen",
      description:
        "Führe die Suchläufe aus, ergänze Kosten und markiere nur die zwei mangelhaften Quellen.",
      estimatedMinutes: 10,
      points: 260,
      completionValidation: challengeCompletion,
      solutionComparison: [
        "Drei Suchläufe sichtbar ausgeführt",
        "Vergleichstabelle um Kosten ergänzt",
        "Quelle A und B als mangelhaft markiert",
        "Quelle C nicht fälschlich markiert",
      ],
      steps: [challengeStep],
    }),
  ];
}
