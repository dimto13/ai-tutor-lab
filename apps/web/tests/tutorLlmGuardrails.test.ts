import assert from "node:assert/strict";
import test from "node:test";
import type { LlmProvider, LlmRequest, LlmResponse } from "../src/tutor/llm/provider.ts";
import {
  InMemoryTutorSessionBudgetStore,
  TUTOR_HISTORY_MAX_CHARS,
  TUTOR_HISTORY_MAX_TURNS,
  TutorLlmService,
  type TutorLlmContext,
  type TutorLlmAuditEvent,
} from "../src/tutor/llm/tutorGuardrails.ts";

const context: TutorLlmContext = {
  scenarioTitle: "VS Code Grundlagen",
  mode: "guided",
  step: {
    id: "open-explorer",
    title: "Explorer öffnen",
    instruction: "Öffne den Explorer.",
    rationale: "So siehst du Dateien im Workspace.",
  },
  allowedUiTargetRefs: ["vscode.activityBar.explorer"],
};

class FakeProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  readonly id: string;
  private readonly response: LlmResponse;
  private readonly maximumCostMicros: number;

  constructor(id: string, responseValue: LlmResponse, maximumCostMicros = 0) {
    this.id = id;
    this.response = responseValue;
    this.maximumCostMicros = maximumCostMicros;
  }

  estimateMaximumCostMicros(): number {
    return this.maximumCostMicros;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    return this.response;
  }
}

function response(value: unknown, costMicros = 0): LlmResponse {
  // Older tests supply the answer fragment. Fake the NEW model's single structured
  // intent+answer completion without weakening production parsing. Invalid fragments remain invalid.
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const structured =
    candidate && !("intent" in candidate) && "kind" in candidate
      ? {
          intent: candidate["kind"] === "feedback" ? "problem_report" : "learning_help",
          confidence: "high",
          ...candidate,
        }
      : value;
  return {
    text: JSON.stringify(structured),
    model: "fake-model",
    usage: { inputTokens: 20, outputTokens: 10, costMicros },
  };
}

function service(provider: LlmProvider, audit: TutorLlmAuditEvent[] = []) {
  return new TutorLlmService({
    provider,
    budgetStore: new InMemoryTutorSessionBudgetStore(),
    policy: { maxRequests: 3, maxCostMicros: 1_000, maxOutputTokens: 200 },
    auditLogger: (event) => audit.push(event),
  });
}

test("accepts an action only when every referenced UI target exists in the current context", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Klicke links auf den Explorer.",
      kind: "ui_action",
      uiTargetRefs: ["vscode.activityBar.explorer"],
    }),
  );

  const result = await service(provider).answer({
    sessionKey: "session-valid-target",
    context,
    question: { question: "Wo muss ich klicken?" },
    includeUserCode: false,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.uiTargetRefs, ["vscode.activityBar.explorer"]);
  assert.match(
    provider.requests[0]?.messages[0]?.content ?? "",
    /UI-Elemente des aktuellen Schritts \(bevorzugt\):\n- vscode\.activityBar\.explorer/,
  );
});

test("guided prompt uses authored explanation, graded hints and explicitly uncertain diagnostics", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Schau zuerst links auf die Activity Bar.",
      kind: "explanation",
      uiTargetRefs: [],
    }),
  );
  await service(provider).answer({
    sessionKey: "session-guided-coaching",
    context: {
      ...context,
      scenarioDescription: "Orientiere dich in der Oberfläche.",
      step: {
        ...context.step!,
        helpLevels: ["Sieh links nach.", "Öffne das Explorer-Symbol."],
        possibleFailure: "Der Explorer wurde noch nicht geöffnet.",
      },
    },
    question: { question: "Ich komme nicht weiter. Was soll ich versuchen?" },
    includeUserCode: false,
  });
  const prompt = provider.requests[0]?.messages[0]?.content ?? "";
  assert.match(prompt, /Szenariobeschreibung: Orientiere dich in der Oberfläche/);
  assert.match(prompt, /Gestufte Hilfen \(von allgemein zu konkret\):/);
  assert.match(prompt, /1\. Sieh links nach\./);
  assert.match(prompt, /2\. Öffne das Explorer-Symbol\./);
  assert.match(prompt, /Möglicher Fehlerhinweis \(kein Nachweis eines aufgetretenen Fehlers\)/);
  assert.match(prompt, /ohne Bestätigung durch die Trainings-Engine nicht als erledigt/);
  assert.match(prompt, /Antworte zuerst auf die tatsächlich gestellte Frage/);
});

test("explore and challenge use different teaching policies without a Guided hint leak", async () => {
  for (const mode of ["explore", "challenge"] as const) {
    const provider = new FakeProvider(
      "provider-a",
      response({ answer: "Ich erkläre dir das Prinzip.", kind: "explanation", uiTargetRefs: [] }),
    );
    await service(provider).answer({
      sessionKey: `session-${mode}-coaching`,
      context: {
        ...context,
        mode,
        step: {
          ...context.step!,
          helpLevels: ["Geheime Guided-Hilfe."],
          possibleFailure: "Geheime Fehlerursache.",
        },
      },
      question: { question: "Hilf mir bitte." },
      includeUserCode: false,
    });
    const prompt = provider.requests[0]?.messages[0]?.content ?? "";
    assert.doesNotMatch(prompt, /Gestufte Hilfen/);
    assert.doesNotMatch(prompt, /Geheime Guided-Hilfe/);
    assert.doesNotMatch(prompt, /Geheime Fehlerursache/);
    if (mode === "challenge") {
      assert.match(prompt, /verrate nicht ungefragt die komplette Lösung/);
      assert.match(prompt, /keine Guided-Hilfestufen/);
    } else {
      assert.match(prompt, /Fördere eigenes Erkunden/);
      assert.match(prompt, /ohne eine verpflichtende Klickreihenfolge/);
    }
  }
});

test("model prompt labels learner observations as unverified and never includes event payloads", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Prüfe den Explorer und versuche es erneut.",
      kind: "explanation",
      uiTargetRefs: [],
    }),
  );
  await service(provider).answer({
    sessionKey: "session-reported-learning-state",
    context: {
      ...context,
      reportedLearnerState: {
        completedSteps: 2,
        completedStepIds: ["step-a", "step-b"],
        currentStepReportedCompleted: false,
        hintsUsed: 3,
        failedAttempts: 2,
        exploredTargets: 4,
        recentEventTypes: ["file.saved", "explorer.opened"],
      },
    },
    question: { question: "Warum geht es nicht weiter?" },
    includeUserCode: false,
  });
  const system = provider.requests[0]?.messages[0]?.content ?? "";
  assert.match(system, /NICHT serververifiziert/);
  assert.match(system, /Bisherige Fehlversuche: 2/);
  assert.match(system, /Bisher genutzte Hinweise: 3/);
  assert.match(system, /file\.saved, explorer\.opened/);
  assert.match(system, /Trainings-Validator bleibt maßgeblich/);
  assert.doesNotMatch(system, /Dateiinhalt:|Nutzer-Code:|Event-Payload:/);

  const without = new FakeProvider(
    "provider-a",
    response({
      answer: "Bitte beschreibe die Fehlermeldung.",
      kind: "explanation",
      uiTargetRefs: [],
    }),
  );
  await service(without).answer({
    sessionKey: "session-no-reported-state",
    context,
    question: { question: "Warum geht es nicht weiter?" },
    includeUserCode: false,
  });
  assert.doesNotMatch(
    without.requests[0]?.messages[0]?.content ?? "",
    /Vom Browser gemeldeter Lernstand/,
  );
});

test("Guided prompt sees its module sequence, position and exact authored diagnostic", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Prüfe die noch fehlende Beschreibung.",
      kind: "explanation",
      uiTargetRefs: [],
    }),
  );
  await service(provider).answer({
    sessionKey: "universal-guided-context",
    context: {
      ...context,
      scenarioTitle: "Quellcode gemeinsam bearbeiten",
      workflow: {
        learningObjectives: ["Einen Pull Request sicher erstellen"],
        totalSteps: 3,
        currentStepNumber: 2,
        steps: [
          { id: "branch", title: "Branch anlegen", position: 1, status: "reported_completed" },
          { id: "pr", title: "Pull Request erstellen", position: 2, status: "current" },
          { id: "review", title: "Review durchführen", position: 3, status: "not_reported" },
        ],
      },
      step: {
        id: "pr",
        title: "Pull Request erstellen",
        instruction: "Beschreibe Zweck und Änderung.",
        rationale: "Das Review braucht nachvollziehbare Angaben.",
        description: "Titel, Beschreibung und Zielbranch prüfen.",
        expectedOutcome: "Pull Request wurde erkannt.",
        lastFailure: "Die Beschreibung fehlt.",
      },
      reportedLearnerState: {
        completedSteps: 1,
        completedStepIds: ["branch"],
        currentStepReportedCompleted: false,
        lastFailure: "Die Beschreibung fehlt.",
        hintsUsed: 1,
        failedAttempts: 1,
        exploredTargets: 0,
        recentEventTypes: [],
      },
    },
    question: { question: "Woran hänge ich und wie mache ich weiter?" },
    includeUserCode: false,
  });
  const prompt = provider.requests[0]?.messages[0]?.content ?? "";
  assert.match(prompt, /Einen Pull Request sicher erstellen/);
  assert.match(prompt, /Aktuell angezeigter Schritt: 2 von 3/);
  assert.match(prompt, /Branch anlegen \[reported_completed\]/);
  assert.match(prompt, /Pull Request erstellen \[current\]/);
  assert.match(prompt, /Review durchführen \[not_reported\]/);
  assert.match(prompt, /Titel, Beschreibung und Zielbranch prüfen/);
  assert.match(prompt, /Erwartetes Ergebnis laut Aufgabenbeschreibung \(nicht bereits erreicht\)/);
  assert.match(prompt, /Die Beschreibung fehlt/);
  assert.equal(prompt.split("Die Beschreibung fehlt.").length - 1, 1);
  assert.match(prompt, /NICHT serververifiziert/);
  assert.doesNotMatch(prompt, /Die Aufgabe ist bereits erfolgreich abgeschlossen/);
});

test("Challenge keeps objectives but never discloses a solution sequence or latest Guided failure", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Überlege, was der fertige Zustand zeigen sollte.",
      kind: "explanation",
      uiTargetRefs: [],
    }),
  );
  await service(provider).answer({
    sessionKey: "universal-challenge-context",
    context: {
      ...context,
      mode: "challenge",
      workflow: {
        learningObjectives: ["Ein Repository korrekt übergeben"],
        totalSteps: 3,
        currentStepNumber: null,
        steps: [],
      },
      step: {
        ...context.step!,
        helpLevels: ["VERBOTENER_KOMPLETTER_LOESUNGSWEG"],
        possibleFailure: "VERBOTENE_DIAGNOSE",
        description: "VERBOTENE_DETAILANLEITUNG",
        expectedOutcome: "VERBOTENE_MUSTERLOESUNG",
      },
      reportedLearnerState: {
        completedSteps: 0,
        completedStepIds: [],
        currentStepReportedCompleted: false,
        lastFailure: "VERBOTENE_ALTE_FEHLERMELDUNG",
        hintsUsed: 0,
        failedAttempts: 0,
        exploredTargets: 0,
        recentEventTypes: [],
      },
    },
    question: { question: "Hilf mir, ohne die Lösung zu verraten." },
    includeUserCode: false,
  });
  const prompt = provider.requests[0]?.messages[0]?.content ?? "";
  assert.match(prompt, /Ein Repository korrekt übergeben/);
  assert.match(prompt, /keine vollständige Lösungsreihenfolge/);
  assert.doesNotMatch(prompt, /VERBOTENE_/);
});

test("the request ID and tenant reference reach the provider and the audit (#482)", async () => {
  const correlation = {
    requestId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    tenantRef: "0123456789abcdef",
  };
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Klicke links auf den Explorer.",
      kind: "ui_action",
      uiTargetRefs: ["vscode.activityBar.explorer"],
    }),
  );
  const audit: TutorLlmAuditEvent[] = [];

  await service(provider, audit).answer({
    sessionKey: "session-correlation",
    context,
    question: { question: "Wo muss ich klicken?" },
    includeUserCode: false,
    correlation,
  });

  assert.deepEqual(provider.requests[0]?.correlation, correlation);
  assert.equal(audit[0]?.requestId, correlation.requestId);
  assert.equal(audit[0]?.tenantRef, correlation.tenantRef);
});

test("answers a tool question beyond the current step with a catalog target (#476)", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer:
        "Das Terminal findest du unten im Panel. Für diesen Schritt brauchst du es noch nicht.",
      kind: "explanation",
      uiTargetRefs: ["vscode.panel.terminal"],
    }),
  );
  const catalogContext: TutorLlmContext = {
    ...context,
    stepUiTargetRefs: ["vscode.activityBar.explorer"],
    allowedUiTargetRefs: ["vscode.activityBar.explorer", "vscode.panel.terminal"],
    uiTargetLabels: {
      "vscode.activityBar.explorer": "Explorer",
      "vscode.panel.terminal": "Terminal",
    },
  };

  const result = await service(provider).answer({
    sessionKey: "session-tool-question",
    context: catalogContext,
    question: { question: "Wo finde ich das Terminal?" },
    includeUserCode: false,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.uiTargetRefs, ["vscode.panel.terminal"]);
  const systemMessage = provider.requests[0]?.messages[0]?.content ?? "";
  assert.match(
    systemMessage,
    /Weitere UI-Elemente des Werkzeugs:\n- vscode\.panel\.terminal \(Terminal\)/,
  );
  assert.match(systemMessage, /Vertröste nicht auf den Trainingskontext/);
  assert.doesNotMatch(systemMessage, /ausschließlich auf Basis des angegebenen Trainingskontexts/);
});

test("fails closed when a provider invents an unknown UI target", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Klicke auf den erfundenen Cloud-Button.",
      kind: "ui_action",
      uiTargetRefs: ["vscode.cloud.magicButton"],
    }),
  );

  const result = await service(provider).answer({
    sessionKey: "session-invented-target",
    context,
    question: { question: "Was jetzt?" },
    includeUserCode: false,
  });

  assert.equal(result.status, "guardrail");
  assert.equal(result.uiTargetRefs.length, 0);
  assert.match(result.answer, /nicht sicher/);
});

test("fails closed when Unicode action language has no semantic UI reference", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({ answer: "Öffne den Cloud-Assistenten.", kind: "explanation", uiTargetRefs: [] }),
  );

  const result = await service(provider).answer({
    sessionKey: "session-action-without-ref",
    context,
    question: { question: "Was jetzt?" },
    includeUserCode: false,
  });

  assert.equal(result.status, "guardrail");
});

test("earlier chat turns reach the provider before the current question, answers as JSON", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Den Explorer öffnest du über das oberste Symbol links.",
      kind: "explanation",
      uiTargetRefs: [],
    }),
  );

  await service(provider).answer({
    sessionKey: "session-follow-up",
    context,
    question: {
      question: "Und wo finde ich den?",
      history: [
        { role: "user", text: "Was ist der Explorer?" },
        { role: "tutor", text: "Der Explorer zeigt die Dateien deines Workspace." },
      ],
    },
    includeUserCode: false,
  });

  const messages = provider.requests[0]?.messages ?? [];
  assert.deepEqual(
    messages.map(({ role }) => role),
    ["system", "user", "assistant", "user"],
  );
  assert.equal(messages[1]?.content, "Was ist der Explorer?");
  assert.deepEqual(JSON.parse(messages[2]?.content ?? "{}"), {
    intent: "learning_help",
    confidence: "high",
    answer: "Der Explorer zeigt die Dateien deines Workspace.",
    kind: "explanation",
    uiTargetRefs: [],
  });
  assert.equal(messages[3]?.content, "Und wo finde ich den?");
  assert.match(messages[0]?.content ?? "", /beantworte immer die letzte Nutzernachricht/);
});

test("the replayed history keeps only the newest turns within the turn and size limits", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({ answer: "Ok.", kind: "explanation", uiTargetRefs: [] }),
  );
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 === 0 ? ("user" as const) : ("tutor" as const),
    text: `Nachricht ${index}`,
  }));

  await service(provider).answer({
    sessionKey: "session-history-limit",
    context,
    question: { question: "Weiter?", history },
    includeUserCode: false,
  });
  const turns = (provider.requests[0]?.messages ?? []).slice(1, -1);
  assert.equal(turns.length, TUTOR_HISTORY_MAX_TURNS);
  assert.equal(turns[0]?.content, "Nachricht 4");

  await service(provider).answer({
    sessionKey: "session-history-size",
    context,
    question: {
      question: "Weiter?",
      history: [
        { role: "user", text: "a".repeat(TUTOR_HISTORY_MAX_CHARS - 10) },
        { role: "tutor", text: "Lange alte Antwort" },
        { role: "user", text: "Frage 2" },
        { role: "tutor", text: "Antwort 2" },
      ],
    },
    includeUserCode: false,
  });
  const sizedTurns = (provider.requests[1]?.messages ?? []).slice(1, -1);
  assert.deepEqual(
    sizedTurns.map(({ role }) => role),
    ["user", "assistant"],
  );
  assert.equal(sizedTurns[0]?.content, "Frage 2");
});

test("only answered questions are replayed, so the roles strictly alternate", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({ answer: "Ok.", kind: "explanation", uiTargetRefs: [] }),
  );

  await service(provider).answer({
    sessionKey: "session-history-roles",
    context,
    question: {
      question: "Und wo finde ich den?",
      history: [
        { role: "tutor", text: "Antwort ohne Frage im Verlauf" },
        { role: "user", text: "Der Button reagiert nicht" },
        { role: "user", text: "Was ist der Explorer?" },
        { role: "tutor", text: "Der Explorer zeigt die Dateien." },
        { role: "user", text: "Unbeantwortete Meldung" },
      ],
    },
    includeUserCode: false,
  });

  const messages = provider.requests[0]?.messages ?? [];
  assert.deepEqual(
    messages.map(({ role }) => role),
    ["system", "user", "assistant", "user"],
  );
  assert.equal(messages[1]?.content, "Was ist der Explorer?");
  assert.equal(messages[3]?.content, "Und wo finde ich den?");
});

test("a platform problem comes back as feedback instead of a learning answer (#147, #548)", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({
      answer: "Du meinst, dass dein Speichern nach Enter als falsch gewertet wurde.",
      kind: "feedback",
      uiTargetRefs: [],
    }),
  );

  const result = await service(provider).answer({
    sessionKey: "session-feedback-kind",
    context: {
      ...context,
      platformKnowledge: [{ title: "Problem melden", answer: "Über „Ich habe ein Problem“." }],
    },
    question: { question: "Nach Enter und Speichern gilt die Aufgabe als falsch." },
    includeUserCode: false,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.kind, "feedback");
  const systemMessage = provider.requests[0]?.messages[0]?.content ?? "";
  assert.match(systemMessage, /problem_report\/feature_request\/feedback.*kind=feedback/);
  assert.match(systemMessage, /Plattformwissen:\n- Problem melden: Über „Ich habe ein Problem“\./);
});

test("user code enters the provider prompt only after the caller grants tenant opt-in", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({ answer: "Die Variable ist lokal.", kind: "explanation", uiTargetRefs: [] }),
  );
  const tutor = service(provider);
  const question = { question: "Was macht der Code?", userCode: "const secret = 42;" };

  await tutor.answer({
    sessionKey: "session-no-code-opt-in",
    context,
    question,
    includeUserCode: false,
  });
  await tutor.answer({
    sessionKey: "session-code-opt-in",
    context,
    question,
    includeUserCode: true,
  });

  const firstUserMessage = provider.requests[0]?.messages[1]?.content ?? "";
  const secondUserMessage = provider.requests[1]?.messages[1]?.content ?? "";
  assert.doesNotMatch(firstUserMessage, /secret = 42/);
  assert.match(secondUserMessage, /USER_CODE_BEGIN/);
  assert.match(secondUserMessage, /secret = 42/);
});

test("server-side cost reservation rejects a request before calling any provider", async () => {
  const audit: TutorLlmAuditEvent[] = [];
  const provider = new FakeProvider(
    "paid-provider",
    response({ answer: "Antwort", kind: "explanation", uiTargetRefs: [] }, 2_000),
    2_000,
  );
  const tutor = service(provider, audit);

  const result = await tutor.answer({
    sessionKey: "session-over-budget",
    context,
    question: { question: "Erkläre mir den Schritt." },
    includeUserCode: false,
  });

  assert.equal(result.status, "budget_exhausted");
  assert.equal(provider.requests.length, 0);
  assert.equal(audit[0]?.status, "budget_exhausted");
});

test("budget settlement charges actual cost and expires old server sessions", () => {
  let now = 1_000;
  const store = new InMemoryTutorSessionBudgetStore({ ttlMs: 1_000, now: () => now });
  const policy = { maxRequests: 3, maxCostMicros: 1_000, maxOutputTokens: 200 };
  const reservation = store.reserve("identity:tenant:user", 500, policy);

  assert.ok(reservation);
  assert.deepEqual(store.snapshot("identity:tenant:user"), {
    requestCount: 1,
    costMicros: 500,
  });

  store.settle(reservation, 125);
  assert.deepEqual(store.snapshot("identity:tenant:user"), {
    requestCount: 1,
    costMicros: 125,
  });

  now += 1_001;
  assert.deepEqual(store.snapshot("identity:tenant:user"), {
    requestCount: 0,
    costMicros: 0,
  });
});

test("the same guardrail contract applies to different provider implementations", async () => {
  for (const providerId of ["provider-a", "provider-b"]) {
    const provider = new FakeProvider(
      providerId,
      response({
        answer: "Klicke auf den erfundenen Button.",
        kind: "ui_action",
        uiTargetRefs: ["invented.target"],
      }),
    );
    const result = await service(provider).answer({
      sessionKey: `session-${providerId}`,
      context,
      question: { question: "Was jetzt?" },
      includeUserCode: false,
    });
    assert.equal(result.status, "guardrail");
  }
});

test("a failed attempt reaches the model with the help path, so it explains what is missing (#591)", async () => {
  const provider = new FakeProvider(
    "provider-a",
    response({ answer: "Ergänze die Beschreibung.", kind: "explanation", uiTargetRefs: [] }),
  );

  await service(provider).answer({
    sessionKey: "session-last-failure",
    context: {
      ...context,
      step: {
        ...context.step!,
        helpLevels: ["Hinweis", "Konkrete Anweisung", "Visuelle Hilfe mit Handlung"],
        lastFailure: "Die Beschreibung ist noch zu knapp.",
      },
    },
    question: { question: "Ich komme nicht weiter" },
    includeUserCode: false,
  });

  const systemMessage = provider.requests[0]?.messages[0]?.content ?? "";
  assert.match(
    systemMessage,
    /Gestufte Hilfen \(von allgemein zu konkret\):\n1\. Hinweis\n2\. Konkrete Anweisung\n3\. Visuelle Hilfe mit Handlung/,
  );
  assert.match(
    systemMessage,
    /Der letzte Versuch des Lernenden hat diesen Schritt nicht abgeschlossen\. Rückmeldung der Plattform: Die Beschreibung ist noch zu knapp\./,
  );
  assert.match(systemMessage, /Wiederhole nicht nur die Anweisung des Schritts/);
});

test("one model completion chooses the input intent without a keyword preclassifier", async () => {
  for (const model of [
    {
      question: "Ich habe KEIN Problem. Was bedeutet Issue?",
      answer: {
        intent: "tool_question",
        confidence: "high",
        answer: "Ein Issue beschreibt eine Aufgabe.",
        kind: "explanation",
        uiTargetRefs: [],
      },
      expected: "tool_question",
      kind: "explanation",
    },
    {
      question: "Meine korrekte Aufgabe wurde als falsch bewertet.",
      answer: {
        intent: "problem_report",
        confidence: "high",
        answer: "Du meldest eine falsche Bewertung.",
        kind: "feedback",
        uiTargetRefs: [],
      },
      expected: "problem_report",
      kind: "feedback",
    },
    {
      question: "Das geht nicht.",
      answer: {
        intent: "unclear",
        confidence: "low",
        answer: "Geht es um den Schritt oder die Plattform?",
        kind: "clarification",
        uiTargetRefs: [],
      },
      expected: "unclear",
      kind: "clarification",
    },
  ] as const) {
    const provider = new FakeProvider("model-intent", response(model.answer));
    const audit: TutorLlmAuditEvent[] = [];
    const result = await service(provider, audit).answer({
      sessionKey: `single-completion-${model.expected}`,
      context,
      question: { question: model.question },
      includeUserCode: false,
    });
    assert.equal(provider.requests.length, 1, model.question);
    assert.equal(result.status, "ok", model.question);
    assert.equal(result.intent, model.expected, model.question);
    assert.equal(result.kind, model.kind, model.question);
    assert.equal(audit[0]?.intent, model.expected);
    assert.equal(audit[0]?.model, "fake-model");
    assert.equal(JSON.stringify(audit).includes(model.question), false);
    if (model.expected === "problem_report") {
      assert.equal(result.feedbackKind, "problem");
      assert.equal(Object.hasOwn(result, "sent"), false);
    }
  }
});

test("explicitly rejected feedback is passed to the model as an answer-only preference", async () => {
  const provider = new FakeProvider(
    "model-intent",
    response({
      intent: "learning_help",
      confidence: "high",
      answer: "Prüfe deinen letzten Versuch und die aktuelle Schrittrückmeldung.",
      kind: "explanation",
      uiTargetRefs: [],
    }),
  );
  const result = await service(provider).answer({
    sessionKey: "answer-instead",
    context,
    question: {
      question: "Die Plattform bewertet das falsch.",
      answerAsQuestion: true,
    },
    includeUserCode: false,
  });
  assert.equal(result.status, "ok");
  assert.equal(provider.requests.length, 1);
  const last = provider.requests[0]?.messages.at(-1)?.content ?? "";
  assert.match(last, /vorherige Meldeangebot ausdrücklich abgelehnt/);
  assert.match(last, /Die Plattform bewertet das falsch/);
  assert.doesNotMatch(last, /USER_CODE_BEGIN/);
});

test("forged model-side report and invalid JSON fail closed after one request", async () => {
  const values: unknown[] = [
    {
      intent: "problem_report",
      confidence: "high",
      answer: "Sent!",
      kind: "feedback",
      uiTargetRefs: [],
      sendAutomatically: true,
    },
    {
      intent: "learning_help",
      confidence: "high",
      answer: "Fertig.",
      kind: "ui_action",
      uiTargetRefs: ["invented.ui.button"],
    },
  ];
  for (const value of values) {
    const provider = new FakeProvider("model-intent", response(value));
    const result = await service(provider).answer({
      sessionKey: "forged-model-output",
      context,
      question: { question: "Was ist passiert?" },
      includeUserCode: false,
    });
    assert.equal(provider.requests.length, 1);
    assert.equal(result.status, "guardrail");
    assert.equal(result.uiTargetRefs.length, 0);
  }
});
