import assert from "node:assert/strict";
import test from "node:test";
import type { LlmProvider, LlmRequest, LlmResponse } from "../src/tutor/llm/provider.ts";
import {
  InMemoryTutorSessionBudgetStore,
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

  constructor(
    readonly id: string,
    private readonly response: LlmResponse,
    private readonly maximumCostMicros = 0,
  ) {}

  estimateMaximumCostMicros(): number {
    return this.maximumCostMicros;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    return this.response;
  }
}

function response(value: unknown, costMicros = 0): LlmResponse {
  return {
    text: JSON.stringify(value),
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
  assert.match(provider.requests[0]?.messages[0]?.content ?? "", /Erlaubte UiTargetRefs/);
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

test("fails closed when action language has no semantic UI reference", async () => {
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
