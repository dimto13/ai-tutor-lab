import type { FeedbackKind } from "../lib/feedbackStore";
import type { TutorContext } from "./tutorContext";
import { findPlatformTopic } from "./platformKnowledge.ts";
import { classifyTutorIntent, type TutorIntent, type TutorIntentDecision } from "./tutorIntent.ts";
import { normalizeTutorText } from "./tutorText.ts";

export interface TutorGlossaryConcept {
  term?: string;
  aliases?: string[];
  simple: string;
  advanced: string;
}

export type GlossaryLookup = (question: string) => TutorGlossaryConcept | null;

/**
 * Offer to pass the learner's own text to the team as feedback. Nothing is sent before the learner
 * confirms it in the chat with one click or edits it in the feedback dialog (#147); the learner never
 * has to describe the problem again. With `clarify`, the tutor first asks whether the learner wanted
 * an answer instead.
 */
export interface TutorFeedbackOffer {
  kind: FeedbackKind;
  clarify: boolean;
}

export interface TutorReply {
  text: string;
  intent: TutorIntent;
  offer?: TutorFeedbackOffer;
  /**
   * Used only when no model answered: an unrecognised statement is asked back with both ways
   * instead of being sent off to a button elsewhere.
   */
  fallbackOffer?: TutorFeedbackOffer;
}

const NO_OPEN_STEP = "Für dieses Modul ist aktuell keine weitere Aufgabe offen.";

function isExactTerm(concept: TutorGlossaryConcept, text: string): boolean {
  return [concept.term, ...(concept.aliases ?? [])].some(
    (candidate) => candidate !== undefined && normalizeTutorText(candidate) === text,
  );
}

function stepHelpHint(context: TutorContext): string {
  const firstHelp = context.currentStep?.helpLevels[0];
  return context.mode === "guided" && firstHelp
    ? ` Falls du nur bei der Aufgabe nicht weiterkommst: ${firstHelp}`
    : "";
}

function conceptAnswer(concept: TutorGlossaryConcept, question: string): string {
  const wantsDepth = /genau|detail|technisch|vertief|tiefer|ausführ/i.test(question);
  return wantsDepth ? `${concept.simple} ${concept.advanced}` : concept.simple;
}

/** Without a model the tutor admits that it has no prepared answer instead of guessing. */
function unpreparedAnswer(
  question: string,
  context: TutorContext,
  findGlossaryConcept: GlossaryLookup,
): string {
  const step = context.currentStep;
  const concept = findGlossaryConcept(question);
  const stepPart = step ? ` Für die aktuelle Aufgabe: ${step.instruction}` : "";
  if (concept) {
    const term = concept.term ? `Zum Begriff „${concept.term}“: ` : "";
    return `Eine vorbereitete Antwort auf genau diese Frage habe ich nicht. ${term}${concept.simple}${stepPart}`;
  }
  return step
    ? `Dazu gibt es im zentralen Begriffskatalog keine vorbereitete Definition. Bezogen auf die aktuelle Aufgabe: ${step.instruction}`
    : "Dazu gibt es im zentralen Begriffskatalog keine vorbereitete Definition.";
}

const ASK_BACK =
  "Ich möchte dich richtig verstehen: Brauchst du Hilfe bei der Aufgabe, oder funktioniert in der Plattform etwas nicht so, wie es sollte?";

function unpreparedStatement(context: TutorContext): string {
  const step = context.currentStep;
  return `${ASK_BACK}${step ? ` Für die aktuelle Aufgabe: ${step.instruction}` : ""}`;
}

/** What the learner may want to know about the platform part their report touches. */
function reportContext(question: string): string {
  const topic = findPlatformTopic(question);
  return topic && topic.id !== "report" ? ` Zur Einordnung: ${topic.answer}` : "";
}

export function classifyWithGlossary(
  question: string,
  findGlossaryConcept: GlossaryLookup,
): TutorIntentDecision {
  return classifyTutorIntent(question, {
    isKnownTerm: (text) => {
      const concept = findGlossaryConcept(text);
      return concept !== null && isExactTerm(concept, text);
    },
  });
}

export function replyDeterministically(
  question: string,
  context: TutorContext,
  findGlossaryConcept: GlossaryLookup,
  decision: TutorIntentDecision = classifyWithGlossary(question, findGlossaryConcept),
): TutorReply {
  const step = context.currentStep;
  const intent = decision.intent;

  switch (intent) {
    case "next_step": {
      if (context.stateSummary.isFinished)
        return { intent, text: "Du hast das Modul abgeschlossen." };
      if (context.mode === "explore") {
        return {
          intent,
          text: "Erkunde die Oberfläche frei. Klicke auf einen Bereich, den du noch nicht untersucht hast; die Erklärung erscheint im Guide.",
        };
      }
      if (!step) return { intent, text: NO_OPEN_STEP };
      return {
        intent,
        text:
          context.mode === "challenge"
            ? step.instruction
            : `${step.instruction} ${step.helpLevels[0]}`.trim(),
      };
    }
    case "rationale":
      return {
        intent,
        text: step ? (step.rationale ?? step.why ?? step.instruction) : NO_OPEN_STEP,
      };
    case "progress":
      if (context.mode === "explore") {
        return {
          intent,
          text: `Du bist in "${context.scenario.title}" und hast ${context.stateSummary.exploredTargets} Oberflächenbereiche untersucht.`,
        };
      }
      return {
        intent,
        text: `Du bist in "${context.scenario.title}"${step ? ` bei "${step.title}"` : " und hast das Modul abgeschlossen"}. ${context.stateSummary.completedSteps} Schritte sind abgeschlossen.`,
      };
    case "platform":
      return {
        intent,
        text:
          decision.platformTopic?.answer ??
          unpreparedAnswer(question, context, findGlossaryConcept),
      };
    case "definition": {
      const concept =
        (decision.subject ? findGlossaryConcept(decision.subject) : null) ??
        findGlossaryConcept(question);
      return {
        intent,
        text: concept
          ? conceptAnswer(concept, question)
          : unpreparedAnswer(question, context, findGlossaryConcept),
      };
    }
    case "smalltalk":
      return {
        intent,
        text: /^(?:hallo|hi|hey|guten|moin|servus)/i.test(question.trim())
          ? "Hallo! Ich helfe dir bei diesem Training. Frag mich zum Beispiel „Was soll ich jetzt machen?“ oder nach einem Begriff."
          : "Gern! Wenn du nicht weiterkommst, frag einfach – zum Beispiel „Was soll ich jetzt machen?“.",
      };
    case "problem_report":
      return {
        intent,
        text: `Danke, das klingt nach einem Fehler in der Plattform und nicht nach etwas, das du falsch gemacht hast. Ich kann deine Beschreibung so, wie du sie geschrieben hast, mit dem Trainingskontext an das Team weitergeben – du musst nichts noch einmal eintippen.${reportContext(question)}${stepHelpHint(context)}`,
        offer: { kind: "problem", clarify: false },
      };
    case "feature_request":
      return {
        intent,
        text: "Danke für deinen Vorschlag! Ich kann ihn so, wie du ihn geschrieben hast, als Verbesserungsvorschlag an das Team weitergeben.",
        offer: { kind: "improvement", clarify: false },
      };
    case "feedback":
      return {
        intent,
        text: "Danke für deine Rückmeldung! Wenn du möchtest, kann ich sie so, wie du sie geschrieben hast, an das Team weitergeben.",
        offer: { kind: decision.usability ? "ux" : "general", clarify: false },
      };
    case "unclear":
      if (decision.feedbackCandidate === "feature_request") {
        return {
          intent,
          text: "Ich möchte dich richtig verstehen: Soll ich deine Frage beantworten, oder möchtest du das als Verbesserungsvorschlag an das Team geben?",
          offer: { kind: "improvement", clarify: true },
        };
      }
      if (decision.feedbackCandidate) {
        return { intent, text: ASK_BACK, offer: { kind: "problem", clarify: true } };
      }
      return {
        intent,
        text: "Ich habe dich nicht verstanden. Stell mir eine Frage, zum Beispiel „Was soll ich jetzt machen?“.",
      };
    case "question":
      // A statement without a question form never gets a glossary text: this is how a complaint
      // turned into the definition of "Issue" (#548).
      return decision.confidence === "high"
        ? { intent, text: unpreparedAnswer(question, context, findGlossaryConcept) }
        : {
            intent,
            text: unpreparedStatement(context),
            fallbackOffer: { kind: "problem", clarify: true },
          };
  }
}

export function answerDeterministically(
  question: string,
  context: TutorContext,
  findGlossaryConcept: GlossaryLookup,
): string {
  return replyDeterministically(question, context, findGlossaryConcept).text;
}
