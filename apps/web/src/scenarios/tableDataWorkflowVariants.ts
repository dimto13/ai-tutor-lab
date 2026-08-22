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
  id: "explore-table-analysis",
  title: "Tabellenauswertung frei untersuchen",
  description:
    "Erkunde die synthetischen Ausgangsdaten, die drei getrennten Bereinigungsregeln, die sichtbaren Zwischenstände und den Plausibilitätsfehler.",
  instruction:
    "Untersuche Referenz, Arbeitstabelle und Bereinigungsregeln in eigener Reihenfolge. Wende Revisionen an und achte darauf, wie sich Zwischenwerte und Vollständigkeit verändern.",
  why: "Explore macht sichtbar, dass eine Tabellenanalyse nicht nur aus Rechnen besteht, sondern aus fachlichen Annahmen, Zwischenständen und Gegenprüfung.",
  helpLevels: [
    "Beginne mit der synthetischen Referenztabelle.",
    "Öffne jede Bereinigungsregel einzeln und vergleiche sie mit den Daten.",
    "Wende die Revisionen an und prüfe nach der Retouren-Iteration, ob weiterhin alle vier Regionen enthalten sind.",
  ],
  successMessage: "Die zentralen Flächen der Tabellenauswertung wurden untersucht.",
};

const challengeStep: TrainingStep = {
  id: "clean-calculate-and-check",
  title: "Tabellenauswertung selbstständig absichern",
  description:
    "Bewertet wird der vollständige Arbeitszyklus: drei Bereinigungsregeln einzeln prüfen, Zwischenstände erzeugen, Retouren ausschließen, den stillen Vollständigkeitsfehler finden, korrigieren und erst danach freigeben.",
  instruction:
    "Prüfe jede Bereinigungsregel einzeln, bereinige die Arbeitstabelle schrittweise, erzeuge Quartalswerte, rechne anschließend ohne Retouren, benenne die fehlende Region in Copilot, korrigiere sie und prüfe den Endstand.",
  why: "Die Challenge prüft nicht Programmierwissen, sondern ob du Annahmen und Ergebnis aktiv gegen die synthetische Referenz absicherst.",
  helpLevels: [
    "Bestätige die drei Bereinigungsregeln jeweils separat und arbeite die Revisionen nacheinander durch.",
    "Nach der Iteration ohne Retouren enthält die Auswertung nur noch drei statt vier Regionen.",
    "Benenne Ost in Copilot, stelle die Region wieder her und markiere erst den korrigierten Endstand als geprüft.",
  ],
  successMessage: "Die Tabellenanalyse wurde mit bestätigten Annahmen, sichtbaren Zwischenständen und korrigiertem Vollständigkeitsfehler abgeschlossen.",
};

const challengeCompletion: Validation = {
  kind: "all",
  of: [
    { kind: "state", selector: "artifact.verifiedIds", includes: "rule-regions" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "normalize-regions" },
    { kind: "state", selector: "artifact.verifiedIds", includes: "rule-dates" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "normalize-dates" },
    { kind: "state", selector: "artifact.verifiedIds", includes: "rule-values" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "normalize-values" },
    { kind: "state", selector: "artifact.appliedRevisionIds", includes: "aggregate-baseline" },
    {
      kind: "sequence",
      ordered: true,
      of: [
        {
          kind: "event",
          type: "artifact.updated",
          match: { artifactId: "working-table", revisionId: "exclude-returns" },
        },
        { kind: "event", type: "copilot.prompt.submitted", contains: { prompt: "Ost" } },
        {
          kind: "event",
          type: "artifact.updated",
          match: { artifactId: "working-table", revisionId: "restore-east" },
        },
        {
          kind: "event",
          type: "artifact.verified",
          match: { artifactId: "working-table", artifactType: "table" },
        },
      ],
    },
  ],
};

export function createTableDataWorkflowVariants(base: Scenario): [Scenario, Scenario] {
  return [
    createModeVariant(base, {
      id: "table-data-workflow.explore",
      mode: "explore",
      title: "Tabellendaten und Annahmen frei erkunden",
      description:
        "Untersuche einen vollständig synthetischen Datensatz, Bereinigungsannahmen, Zwischenstände und die Wirkung einer fachlichen Iteration.",
      estimatedMinutes: 12,
      points: 90,
      exploreTargets: [
        "artifact.preview.panel",
        "artifact.preview.selector",
        "artifact.preview.table",
        "artifact.preview.applyRevision",
        "artifact.preview.verify",
        "copilot.chat.prompt",
      ],
      steps: [exploreStep],
    }),
    createModeVariant(base, {
      id: "table-data-workflow.challenge",
      mode: "challenge",
      title: "Challenge: Tabellenauswertung prüfen und korrigieren",
      description:
        "Bestätige Bereinigungsannahmen einzeln, verfolge Zwischenstände und finde den eingebauten Vollständigkeitsfehler ohne Klickführung.",
      estimatedMinutes: 14,
      points: 320,
      completionValidation: challengeCompletion,
      solutionComparison: [
        "Regions-, Datums- und Betragsregel jeweils separat geprüft",
        "Drei Bereinigungszwischenstände und Quartalsaggregation nachvollzogen",
        "Iteration ohne Retouren durchgeführt",
        "Ost als fehlende Region gegen die Referenz erkannt und benannt",
        "Ost wiederhergestellt und korrigierten Endstand geprüft",
      ],
      steps: [challengeStep],
    }),
  ];
}
