import assert from "node:assert/strict";
import test from "node:test";
import { routeTutorModelOutput, type TutorModelIntent } from "../src/tutor/llm/tutorModelIntent.ts";

/**
 * Fake-provider workflow contracts, NOT a semantic model evaluation.
 * Each synthetic model result is checked against the safe UI routing contract.
 * Real German utterance classification on gemma4:e4b@local belongs to #575.
 */
const allowedRefs = ["vscode.panel.terminal", "vscode.activityBar.explorer"] as const;
type AnswerIntent =
  "learning_help" | "platform_question" | "tool_question" | "general_question" | "smalltalk";
type Case = {
  id: string;
  mode: "guided" | "explore" | "challenge";
  utterance: string;
  intent: AnswerIntent;
  answer: string;
  contains: string;
  uiTargetRefs?: string[];
};

const answerWorkflows: Case[] = [
  {
    id: "guided-next",
    mode: "guided",
    utterance: "Was soll ich als Nächstes machen?",
    intent: "learning_help",
    answer: "Öffne zuerst den Explorer.",
    contains: "Explorer",
  },
  {
    id: "guided-why",
    mode: "guided",
    utterance: "Wozu brauche ich diesen Schritt?",
    intent: "learning_help",
    answer: "So lernst du, Dateien gezielt anzulegen.",
    contains: "Dateien",
  },
  {
    id: "guided-followup",
    mode: "guided",
    utterance: "Und wo genau ist das?",
    intent: "learning_help",
    answer: "Der Explorer ist links in der Activity Bar.",
    contains: "links",
  },
  {
    id: "guided-failed-attempt",
    mode: "guided",
    utterance: "Ich habe es versucht, komme aber nicht weiter. Welche Information fehlt?",
    intent: "learning_help",
    answer:
      "Prüfe den zuletzt angezeigten Hinweis; ich kann deinen Fortschritt nicht selbst bestätigen.",
    contains: "nicht selbst bestätigen",
  },
  {
    id: "explore-free",
    mode: "explore",
    utterance: "Kann ich erst einmal die Oberfläche erkunden?",
    intent: "learning_help",
    answer: "Ja, du kannst die Bereiche ohne feste Klickreihenfolge erkunden.",
    contains: "ohne feste",
  },
  {
    id: "challenge-no-spoiler",
    mode: "challenge",
    utterance: "Gib mir einen Denkanstoß, aber nicht die Lösung.",
    intent: "learning_help",
    answer: "Überlege zuerst, an welcher Stelle du die Datei findest.",
    contains: "Überlege",
  },
  {
    id: "platform-score",
    mode: "guided",
    utterance: "Wo sehe ich meine Punkte?",
    intent: "platform_question",
    answer: "Deine Punkte werden im Trainingsfortschritt angezeigt.",
    contains: "Trainingsfortschritt",
  },
  {
    id: "platform-help",
    mode: "explore",
    utterance: "Wie funktionieren die drei Lernmodi?",
    intent: "platform_question",
    answer:
      "Guided führt dich; Explore lässt dich erkunden; Challenge prüft eigenständiges Handeln.",
    contains: "Challenge",
  },
  {
    id: "platform-feedback",
    mode: "guided",
    utterance: "Wo kann ich einen Fehler melden?",
    intent: "platform_question",
    answer: "Im Tutor kannst du über den Problem-Button eine Meldung vorbereiten.",
    contains: "Problem-Button",
  },
  {
    id: "platform-privacy",
    mode: "guided",
    utterance: "Wird mein Text direkt an das Team geschickt?",
    intent: "platform_question",
    answer: "Nein, du bestätigst eine Meldung vor dem Versand.",
    contains: "bestätigst",
  },
  {
    id: "tool-terminal",
    mode: "guided",
    utterance: "Wo finde ich das Terminal in VS Code?",
    intent: "tool_question",
    answer: "Öffne die Terminal-Ansicht in VS Code.",
    contains: "Terminal",
    uiTargetRefs: ["vscode.panel.terminal"],
  },
  {
    id: "tool-explorer",
    mode: "explore",
    utterance: "Was macht der Explorer?",
    intent: "tool_question",
    answer: "Im Explorer verwaltest du Dateien und Ordner.",
    contains: "Dateien",
  },
  {
    id: "tool-out-of-step",
    mode: "guided",
    utterance:
      "Wie kann ich mir Dateien anzeigen lassen, obwohl das jetzt nicht unser Schritt ist?",
    intent: "tool_question",
    answer: "Der Explorer zeigt Dateien. Du brauchst ihn im aktuellen Schritt nicht zwingend.",
    contains: "aktuellen Schritt",
  },
  {
    id: "general-git",
    mode: "guided",
    utterance: "Was unterscheidet Git von GitHub?",
    intent: "general_question",
    answer: "Git verwaltet Versionen lokal; GitHub ist eine Plattform für Repositories.",
    contains: "Versionen",
  },
  {
    id: "general-off-topic",
    mode: "explore",
    utterance: "Wie entsteht ein neuronales Netz?",
    intent: "general_question",
    answer: "Ein neuronales Netz passt Gewichte anhand von Beispielen an.",
    contains: "Gewichte",
  },
  {
    id: "general-unknown",
    mode: "guided",
    utterance: "Welche genaue Version hat mein Firmenserver?",
    intent: "general_question",
    answer: "Das kann ich ohne deine Systeminformationen nicht zuverlässig feststellen.",
    contains: "nicht zuverlässig",
  },
  {
    id: "thanks",
    mode: "guided",
    utterance: "Danke dir!",
    intent: "smalltalk",
    answer: "Gern. Sag Bescheid, wenn du weitere Fragen hast.",
    contains: "Gern",
  },
  {
    id: "greeting",
    mode: "explore",
    utterance: "Hallo!",
    intent: "smalltalk",
    answer: "Hallo! Was möchtest du erkunden?",
    contains: "Hallo",
  },
  {
    id: "negation-control",
    mode: "guided",
    utterance: "Ich habe keine Probleme. Was bedeutet Issue in GitHub?",
    intent: "tool_question",
    answer: "Ein Issue ist ein Eintrag für Aufgaben oder Diskussionen.",
    contains: "Eintrag",
  },
  {
    id: "topic-switch",
    mode: "guided",
    utterance: "Zurück zu meiner eigentlichen Frage: Wieso ist der Explorer wichtig?",
    intent: "learning_help",
    answer: "Der Explorer hilft dir, die Datei im aktuellen Szenario zu finden.",
    contains: "aktuellen Szenario",
  },
];

test("answer workflow corpus retains 20 independently reported cases", () => {
  assert.equal(answerWorkflows.length, 20);
});

for (const scenario of answerWorkflows) {
  test(`answer workflow [${scenario.id}] (${scenario.mode})`, () => {
    const refs = scenario.uiTargetRefs ?? [];
    const kind = refs.length > 0 ? "ui_action" : "explanation";
    const route = routeTutorModelOutput(
      JSON.stringify({
        intent: scenario.intent,
        confidence: "high",
        answer: scenario.answer,
        kind,
        uiTargetRefs: refs,
      }),
      allowedRefs,
    );
    assert.equal(route.action, "answer", scenario.id);
    if (route.action !== "answer") return;
    assert.equal(route.intent, scenario.intent, scenario.id);
    assert.ok(route.answer.includes(scenario.contains), scenario.id);
    assert.deepEqual(route.uiTargetRefs, refs, scenario.id);
  });
}

const feedbackWorkflows: Array<{
  id: string;
  utterance: string;
  intent: Extract<TutorModelIntent, "problem_report" | "feature_request" | "feedback">;
  kind: "problem" | "improvement" | "general";
  answer: string;
}> = [
  {
    id: "548-bug-not-glossary",
    utterance:
      "Ich habe die Aufgabe korrekt gespeichert, aber sie wird als falsch bewertet – das muss korrigiert werden.",
    intent: "problem_report",
    kind: "problem",
    answer:
      "Du meldest eine vermutlich falsche Bewertung; ich kann den Text für das Team vorbereiten.",
  },
  {
    id: "bug-overlay",
    utterance: "Das Fenster verschwindet beim Speichern sofort.",
    intent: "problem_report",
    kind: "problem",
    answer: "Du beschreibst ein verschwindendes Fenster; du kannst diese Meldung bestätigen.",
  },
  {
    id: "bug-mobile",
    utterance: "Im Querformat komme ich nicht mehr zum Tutor.",
    intent: "problem_report",
    kind: "problem",
    answer: "Das klingt nach einem Darstellungsproblem im Querformat.",
  },
  {
    id: "bug-progress",
    utterance: "Es ist abgehakt, aber mein Fortschritt bleibt bei null.",
    intent: "problem_report",
    kind: "problem",
    answer: "Du meldest eine Abweichung zwischen Schrittstatus und Fortschritt.",
  },
  {
    id: "feature-shortcut",
    utterance: "Es wäre hilfreich, wenn ich das Modul später wiederholen könnte.",
    intent: "feature_request",
    kind: "improvement",
    answer: "Du schlägst eine Wiederholungsfunktion vor.",
  },
  {
    id: "feature-accessibility",
    utterance: "Könntet ihr die Schriftgröße einstellbar machen?",
    intent: "feature_request",
    kind: "improvement",
    answer: "Du wünschst dir eine einstellbare Schriftgröße.",
  },
  {
    id: "feedback-praise",
    utterance: "Das Training ist sehr verständlich.",
    intent: "feedback",
    kind: "general",
    answer: "Danke für deine Rückmeldung zum Training.",
  },
  {
    id: "feedback-critique",
    utterance: "Die Erklärung war viel zu kompliziert.",
    intent: "feedback",
    kind: "general",
    answer: "Du findest die Erklärung zu kompliziert.",
  },
];

test("feedback workflow corpus retains 8 independently reported cases", () => {
  assert.equal(feedbackWorkflows.length, 8);
});

for (const scenario of feedbackWorkflows) {
  test(`feedback workflow [${scenario.id}]`, () => {
    const route = routeTutorModelOutput(
      {
        intent: scenario.intent,
        confidence: "high",
        answer: scenario.answer,
        kind: "feedback",
        uiTargetRefs: [],
      },
      allowedRefs,
    );
    assert.deepEqual(
      route,
      {
        action: "offer_feedback",
        intent: scenario.intent,
        feedbackKind: scenario.kind,
        answer: scenario.answer,
      },
      scenario.id,
    );
    assert.equal(Object.hasOwn(route, "sent"), false);
    assert.equal(Object.hasOwn(route, "issueId"), false);
    if (scenario.id === "548-bug-not-glossary" && route.action === "offer_feedback") {
      assert.doesNotMatch(route.answer, /Ein Issue beschreibt eine Aufgabe/);
    }
  });
}

const ambiguousWorkflows = [
  {
    id: "ambiguous-high-confidence",
    response: {
      intent: "unclear",
      confidence: "high",
      answer: "Meinst du einen Fehler der Plattform oder brauchst du Hilfe?",
      kind: "clarification",
      uiTargetRefs: [],
    },
  },
  {
    id: "learning-low-confidence",
    response: {
      intent: "learning_help",
      confidence: "low",
      answer: "Ich bin unsicher.",
      kind: "clarification",
      uiTargetRefs: [],
    },
  },
  {
    id: "report-low-confidence",
    response: {
      intent: "problem_report",
      confidence: "low",
      answer: "Soll ich dich unterstützen oder eine Meldung vorbereiten?",
      kind: "clarification",
      uiTargetRefs: [],
    },
  },
];

for (const scenario of ambiguousWorkflows) {
  test(`ambiguous workflow [${scenario.id}] asks instead of silently routing`, () => {
    const route = routeTutorModelOutput(scenario.response, allowedRefs);
    assert.equal(route.action, "clarify", scenario.id);
  });
}

const invalidWorkflows = [
  { id: "malformed-json", response: "{bad JSON" },
  {
    id: "unsolicited-send",
    response: {
      intent: "problem_report",
      confidence: "high",
      answer: "Ich sende das sofort.",
      kind: "feedback",
      uiTargetRefs: [],
      sendAutomatically: true,
    },
  },
  {
    id: "invented-ui-target",
    response: {
      intent: "learning_help",
      confidence: "high",
      answer: "Klicke auf den geheimen Button.",
      kind: "ui_action",
      uiTargetRefs: ["missing.ui.target"],
    },
  },
  {
    id: "ui-action-without-target",
    response: {
      intent: "learning_help",
      confidence: "high",
      answer: "Öffne das Terminal.",
      kind: "ui_action",
      uiTargetRefs: [],
    },
  },
  {
    id: "general-question-as-feedback",
    response: {
      intent: "general_question",
      confidence: "high",
      answer: "Meldung erfassen.",
      kind: "feedback",
      uiTargetRefs: [],
    },
  },
  {
    id: "feature-request-as-explanation",
    response: {
      intent: "feature_request",
      confidence: "high",
      answer: "Die Funktion kommt.",
      kind: "explanation",
      uiTargetRefs: [],
    },
  },
  {
    id: "clarification-with-ui-target",
    response: {
      intent: "platform_question",
      confidence: "high",
      answer: "Antwort",
      kind: "clarification",
      uiTargetRefs: ["vscode.panel.terminal"],
    },
  },
];

for (const scenario of invalidWorkflows) {
  test(`invalid model response [${scenario.id}] fails closed`, () => {
    const route = routeTutorModelOutput(scenario.response, allowedRefs);
    assert.equal(route.action, "clarify", scenario.id);
    if (route.action !== "clarify") assert.fail("Invalid model output must clarify");
    assert.equal(route.reason, "invalid_model_decision", scenario.id);
    assert.match(route.answer, /Möchtest du eine Antwort/, scenario.id);
  });
}
