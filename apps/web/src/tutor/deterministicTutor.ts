import type { TutorContext } from "./tutorContext";

export interface TutorGlossaryConcept {
  simple: string;
  advanced: string;
}

export type GlossaryLookup = (question: string) => TutorGlossaryConcept | null;

export function answerDeterministically(
  question: string,
  context: TutorContext,
  findGlossaryConcept: GlossaryLookup,
): string {
  const step = context.currentStep;

  if (/was soll ich|wie weiter|nächste|weiter\?|jetzt machen|hänge/i.test(question)) {
    if (context.stateSummary.isFinished) return "Du hast das Modul abgeschlossen.";
    if (context.mode === "explore") {
      return "Erkunde die Oberfläche frei. Klicke auf einen Bereich, den du noch nicht untersucht hast; die Erklärung erscheint im Guide.";
    }
    if (!step) return "Für dieses Modul ist aktuell keine weitere Aufgabe offen.";
    return context.mode === "challenge"
      ? step.instruction
      : `${step.instruction} ${step.helpLevels[0]}`;
  }

  if (/warum/i.test(question)) {
    return step
      ? (step.rationale ?? step.why ?? step.instruction)
      : "Für dieses Modul ist aktuell keine weitere Aufgabe offen.";
  }

  if (/wo bin ich|fortschritt|status/i.test(question)) {
    if (context.mode === "explore") {
      return `Du bist in "${context.scenario.title}" und hast ${context.stateSummary.exploredTargets} Oberflächenbereiche untersucht.`;
    }
    return `Du bist in "${context.scenario.title}"${step ? ` bei "${step.title}"` : " und hast das Modul abgeschlossen"}. ${context.stateSummary.completedSteps} Schritte sind abgeschlossen.`;
  }

  const concept = findGlossaryConcept(question);
  if (concept) {
    const wantsDepth = /genau|detail|technisch|vertief|tiefer|ausführ/i.test(question);
    return wantsDepth ? `${concept.simple} ${concept.advanced}` : concept.simple;
  }

  return step
    ? `Dazu gibt es im zentralen Begriffskatalog keine vorbereitete Definition. Bezogen auf die aktuelle Aufgabe: ${step.instruction}`
    : "Dazu gibt es im zentralen Begriffskatalog keine vorbereitete Definition.";
}
