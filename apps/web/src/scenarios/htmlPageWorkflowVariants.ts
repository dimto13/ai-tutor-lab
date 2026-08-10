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
  id: "explore-html-page",
  title: "HTML-Workflow frei untersuchen",
  description:
    "Erkunde die Seite, ihre Revisionen, den Wechsel zwischen Vorschau und Quelltext sowie die getrennte Prüfaktion.",
  instruction:
    "Untersuche die Teamübersicht in eigener Reihenfolge. Probiere Vorschau, Quelltext, Revisionen und die Ergebnisprüfung aus.",
  why: "Explore zeigt, dass ein HTML-Artefakt zugleich sichtbares Ergebnis, Quelltext und iterierbarer Arbeitsstand ist.",
  helpLevels: [
    "Beginne bei der gerenderten Teamübersicht.",
    "Wechsle einmal in den Quelltext und zurück.",
    "Wende die Revisionen an und achte darauf, ob bei einer Änderung bestehender Inhalt verloren geht.",
  ],
  successMessage: "Die zentralen Flächen des HTML-Workflows wurden untersucht.",
};

const challengeStep: TrainingStep = {
  id: "build-and-check-page",
  title: "Teamübersicht ohne Klickführung fertigstellen",
  description:
    "Bewertet wird, ob du die drei Iterationen ausführst, den stillen Verlust konkret benennst, ihn korrigierst und erst den korrigierten Endstand prüfst.",
  instruction:
    "Erweitere die Teamübersicht, stelle sie als Tabelle dar, ergänze den Sprunglink, finde den verlorenen Datensatz, benenne ihn in Copilot, korrigiere ihn und prüfe den Endstand.",
  why: "Die Challenge prüft nicht HTML-Wissen, sondern den vollständigen Arbeitszyklus aus Auftrag, Iteration und Gegenprüfung.",
  helpLevels: [
    "Arbeite die sichtbaren Revisionen nacheinander durch.",
    "Nach der Verhaltensänderung fehlt genau eine zuvor vorhandene Person.",
    "Benenne Nora Berger in Copilot, korrigiere den Verlust und markiere erst danach das Ergebnis als geprüft.",
  ],
  successMessage: "Der HTML-Workflow wurde vollständig iteriert, geprüft und korrigiert.",
};

const challengeCompletion: Validation = {
  kind: "all",
  of: [
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "add-mika" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "switch-to-table" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "add-native-behavior" },
    { kind: "state", selector: "copilot.conversation.messageCount", equals: 2 },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "restore-missing-row" },
    { kind: "state", selector: "artifact.verifiedIds", includes: "team-page" },
  ],
};

export function createHtmlPageWorkflowVariants(base: Scenario): [Scenario, Scenario] {
  return [
    createModeVariant(base, {
      id: "html-page-workflow.explore",
      mode: "explore",
      title: "HTML-Seite frei erkunden",
      description:
        "Untersuche den Weg vom sichtbaren HTML-Artefakt über mehrere Revisionen bis zur Gegenprüfung.",
      estimatedMinutes: 10,
      points: 80,
      exploreTargets: [
        "artifact.preview.panel",
        "artifact.preview.selector",
        "artifact.preview.rendered",
        "artifact.preview.viewToggle",
        "artifact.preview.source",
        "artifact.preview.applyRevision",
        "artifact.preview.verify",
      ],
      steps: [exploreStep],
    }),
    createModeVariant(base, {
      id: "html-page-workflow.challenge",
      mode: "challenge",
      title: "Challenge: HTML-Seite iterieren und absichern",
      description:
        "Führe drei Änderungen aus, identifiziere den still verlorenen Datensatz und stelle einen geprüften Endstand her.",
      estimatedMinutes: 10,
      points: 280,
      completionValidation: challengeCompletion,
      solutionComparison: [
        "Mika Scholz ergänzt",
        "Liste in Tabelle überführt",
        "Nativer Sprunglink ergänzt",
        "Nora Berger als stillen Verlust konkret benannt",
        "Verlust korrigiert und finalen Endstand geprüft",
      ],
      steps: [challengeStep],
    }),
  ];
}
