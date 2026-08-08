import assert from "node:assert/strict";
import test from "node:test";
import { answerDeterministically } from "../../src/tutor/deterministicTutor.ts";
import type { TutorContext } from "../../src/tutor/tutorContext.ts";

const context: TutorContext = {
  scenario: {
    id: "test-scenario",
    title: "VS Code Grundlagen",
    description: "Test",
    learningObjectives: ["vscode.workspace"],
  },
  mode: "guided",
  currentStep: {
    id: "open-workspace",
    title: "Workspace öffnen",
    description: "Test",
    instruction: "Öffne den gespeicherten Workspace.",
    why: "Damit mehrere Projektordner gemeinsam als Arbeitskontext geladen werden.",
    helpLevels: ["Nutze das File-Menü.", "Wähle Open Workspace.", "Öffne das File-Menü oben links."],
    successMessage: "Workspace geöffnet.",
  },
  completedStepIds: ["open-folder"],
  recentEvents: [],
  hintUsage: 1,
  failedAttempts: 2,
  stateSummary: {
    completedSteps: 1,
    totalSteps: 3,
    isFinished: false,
    exploredTargets: 0,
    hintsUsed: 1,
    mistakes: 2,
  },
};

const glossary = (question: string) =>
  /workspace/i.test(question)
    ? {
        simple: "Ein Workspace ist dein Arbeitskontext in VS Code.",
        advanced: "Ein gespeicherter Workspace kann mehrere Root-Ordner enthalten.",
      }
    : null;

test("answers the current-step question from scenario content", () => {
  const answer = answerDeterministically("Was soll ich jetzt machen?", context, glossary);
  assert.equal(answer, "Öffne den gespeicherten Workspace. Nutze das File-Menü.");
});

test("answers why from the current step rationale", () => {
  const answer = answerDeterministically("Warum mache ich das?", context, glossary);
  assert.equal(answer, context.currentStep?.why);
});

test("answers glossary questions without a network provider", () => {
  const answer = answerDeterministically("Was ist ein Workspace?", context, glossary);
  assert.equal(answer, "Ein Workspace ist dein Arbeitskontext in VS Code.");
});

test("uses the advanced glossary explanation only when requested", () => {
  const answer = answerDeterministically("Erkläre Workspace technisch genauer", context, glossary);
  assert.equal(
    answer,
    "Ein Workspace ist dein Arbeitskontext in VS Code. Ein gespeicherter Workspace kann mehrere Root-Ordner enthalten.",
  );
});

test("challenge mode never leaks the first help level into the next-step answer", () => {
  const challengeContext: TutorContext = { ...context, mode: "challenge" };
  const answer = answerDeterministically("Wie weiter?", challengeContext, glossary);
  assert.equal(answer, "Öffne den gespeicherten Workspace.");
});
