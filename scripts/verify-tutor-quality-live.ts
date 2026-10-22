#!/usr/bin/env node
/**
 * #575: controlled local-only semantic QA, deliberately absent from default CI.
 * Explicit CLI AND environment opt-in required; one request per case, sequential, no retries.
 * All prompts and raw completions stay in a mode-0600 local file outside the checkout.
 *
 * TUTOR_QUALITY_REAL_OPT_IN=1 LLM_MODEL=gemma4:e4b \\
 *   node --experimental-strip-types scripts/verify-tutor-quality-live.ts --run-real-model
 *
 * Exit 1: automatic failure. Exit 2: all automatic gates passed; mandatory human semantic
 * assessment and independent authenticated browser path are still NOT_TESTED. Never prints PASS.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  diagnoseLocalRoute,
  diagnoseModelCompletion,
  failsCriticalCase,
} from "./tutor-quality-diagnostics.ts";
import { parseScenario } from "../apps/web/src/scenarios/contentLoader.ts";
import { loadLlmProviderConfig } from "../apps/web/src/tutor/llm/config.ts";
import { OllamaProvider } from "../apps/web/src/tutor/llm/ollamaProvider.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "../apps/web/src/tutor/llm/provider.ts";
import { buildTutorContext } from "../apps/web/src/tutor/llm/tutorContext.ts";
import {
  InMemoryTutorSessionBudgetStore,
  TutorLlmService,
} from "../apps/web/src/tutor/llm/tutorGuardrails.ts";

type Intent =
  | "learning_help"
  | "platform_question"
  | "tool_question"
  | "general_question"
  | "problem_report"
  | "feature_request"
  | "feedback"
  | "smalltalk"
  | "unclear";
interface QualityCase {
  id: string;
  scenarioId: string;
  step: "first" | "none";
  expectedIntent: Intent;
  question: string;
  split: "main" | "held-out";
  critical: boolean;
}
interface QualityCorpus {
  version: number;
  model: string;
  cases: QualityCase[];
}

const { values } = parseArgs({
  options: {
    "run-real-model": { type: "boolean", default: false },
  },
});
if (!values["run-real-model"] || process.env["TUTOR_QUALITY_REAL_OPT_IN"] !== "1") {
  throw new Error(
    "Real-model QA requires --run-real-model AND TUTOR_QUALITY_REAL_OPT_IN=1; no request made",
  );
}

const configuration = loadLlmProviderConfig();
if (configuration.model !== "gemma4:e4b") {
  throw new Error("Only explicitly approved local gemma4:e4b is allowed; no request made");
}
const endpoint = new URL(configuration.baseUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) ||
  !["http:", "https:"].includes(endpoint.protocol) ||
  endpoint.username ||
  endpoint.password
) {
  throw new Error("QA must target a direct loopback Ollama endpoint, never a cloud-capable router");
}
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.match(head, /^[0-9a-f]{40}$/, "Only an exact checked-out commit may be tested");
const corpus = JSON.parse(
  await readFile(resolve("tests/runtime/fixtures/tutor-quality-live.de.json"), "utf8"),
) as QualityCorpus;
assert.equal(corpus.version, 1);
assert.equal(corpus.model, configuration.model);
assert.ok(corpus.cases.length >= 30);
assert.ok(corpus.cases.filter((entry) => entry.split === "held-out").length >= 10);
assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, corpus.cases.length);
assert.equal(new Set(corpus.cases.map((entry) => entry.question)).size, corpus.cases.length);
assert.deepEqual(
  [...new Set(corpus.cases.map((entry) => entry.scenarioId.split(".").at(-1)))].sort(),
  ["challenge", "explore", "guided"],
);

const privateDirectory = await mkdtemp(join(tmpdir(), "tutor-quality-live-"));
const evidence: Array<Record<string, unknown>> = [];
const summary: Array<Record<string, unknown>> = [];
let criticalFailures = 0;
let intentHits = 0; // Legacy field: service-accepted intent (not the raw model's choice).
let rawIntentHits = 0;
let rawSchemaValidCount = 0;
let routeFailures = 0;
const diagnosticReasonCounts: Record<string, number> = {};
const routeFailureReasonCounts: Record<string, number> = {};

for (const entry of corpus.cases) {
  // Parse the actual authored scenario; no invented steps, score or runtime references.
  const scenario = parseScenario(
    JSON.parse(await readFile(resolve("content/scenarios", `${entry.scenarioId}.json`), "utf8")),
  );
  const mode = scenario.mode ?? "guided";
  const currentStepId = entry.step === "none" ? null : (scenario.steps[0]?.id ?? null);
  const context = buildTutorContext(scenario, mode, currentStepId);
  const routeHeaders = new Map<string, string>();
  let rawResponse: LlmResponse | null = null;
  let requests = 0;
  let httpStatus: number | null = null;
  const guardedFetch: typeof fetch = async (input, init) => {
    requests += 1;
    if (requests !== 1) throw new Error("QA forbids model retries and second requests");
    const response = await fetch(input, init);
    httpStatus = response.status;
    for (const name of ["via", "x-ollama-account", "x-ollama-route"]) {
      const value = response.headers.get(name);
      if (value) routeHeaders.set(name, value);
    }
    return response;
  };
  const local = new OllamaProvider(configuration, guardedFetch);
  const recordingProvider: LlmProvider = {
    id: local.id,
    estimateMaximumCostMicros: (request: LlmRequest) => local.estimateMaximumCostMicros(request),
    async complete(request: LlmRequest): Promise<LlmResponse> {
      rawResponse = await local.complete(request);
      return rawResponse;
    },
  };
  const tutor = new TutorLlmService({
    provider: recordingProvider,
    budgetStore: new InMemoryTutorSessionBudgetStore(),
    policy: { maxRequests: 1, maxCostMicros: 0, maxOutputTokens: 500 },
    auditLogger: () => {}, // no prompt/answer or synthetic case content in public logs
  });
  const startedAt = performance.now();
  let answer: Awaited<ReturnType<TutorLlmService["answer"]>> | null = null;
  let errorClass: string | null = null;
  try {
    answer = await tutor.answer({
      sessionKey: `quality:${entry.id}`,
      context,
      question: { question: entry.question },
      includeUserCode: false,
    });
  } catch (error) {
    errorClass = error instanceof Error ? error.constructor.name : "UnknownError";
  }
  const latencyMs = Math.round(performance.now() - startedAt);
  const actualIntent = answer?.status === "ok" ? (answer.intent ?? null) : null;
  const diagnosis = diagnoseModelCompletion({
    rawText: rawResponse?.text ?? null,
    expectedIntent: entry.expectedIntent,
    allowedUiTargetRefs: context.allowedUiTargetRefs,
    answer: answer
      ? { status: answer.status, intent: answer.intent }
      : { status: "provider_error" },
  });
  const routeFailureReasons = diagnoseLocalRoute({
    requests,
    via: routeHeaders.get("via") ?? null,
    account: routeHeaders.get("x-ollama-account") ?? null,
    route: routeHeaders.get("x-ollama-route") ?? null,
    rawModel: rawResponse?.model ?? null,
    expectedModel: configuration.model,
    rawResponseReceived: rawResponse !== null,
  });
  const routeIsLocal = routeFailureReasons.length === 0;
  const intentPass = diagnosis.acceptedIntentPass;
  if (diagnosis.rawIntentPass) rawIntentHits += 1;
  if (diagnosis.rawSchemaValid) rawSchemaValidCount += 1;
  if (intentPass) intentHits += 1;
  if (!routeIsLocal) routeFailures += 1;
  diagnosticReasonCounts[diagnosis.reason] = (diagnosticReasonCounts[diagnosis.reason] ?? 0) + 1;
  for (const reason of routeFailureReasons) {
    routeFailureReasonCounts[reason] = (routeFailureReasonCounts[reason] ?? 0) + 1;
  }
  if (failsCriticalCase(entry.critical, diagnosis, routeIsLocal)) criticalFailures += 1;
  summary.push({
    caseId: entry.id,
    split: entry.split,
    moduleId: scenario.moduleId ?? scenario.id,
    scenarioId: scenario.id,
    mode,
    stepId: currentStepId,
    head,
    model: rawResponse ? (rawResponse as LlmResponse).model : null,
    route: routeIsLocal ? "direct-loopback-local" : "INVALID_OR_UNVERIFIED",
    status: answer?.status ?? "provider_error",
    expectedIntent: entry.expectedIntent,
    rawIntent: diagnosis.rawIntent,
    rawConfidence: diagnosis.rawConfidence,
    rawKind: diagnosis.rawKind,
    rawJsonValid: diagnosis.rawJsonValid,
    rawSchemaValid: diagnosis.rawSchemaValid,
    rawIntentPass: diagnosis.rawIntentPass,
    actualIntent,
    intentPass,
    diagnosticReason: diagnosis.reason,
    critical: entry.critical,
    routePass: routeIsLocal,
    routeFailureReasons,
    httpStatus,
    requestCount: requests,
    latencyMs,
    errorClass,
    semanticReview: "NOT_TESTED",
  });
  evidence.push({
    caseId: entry.id,
    scenarioId: entry.scenarioId,
    question: entry.question,
    rawModelOutput: rawResponse ? (rawResponse as LlmResponse).text : null,
    displayedTutorAnswer: answer?.answer ?? null,
    expectedIntent: entry.expectedIntent,
    rawIntent: diagnosis.rawIntent,
    rawConfidence: diagnosis.rawConfidence,
    rawKind: diagnosis.rawKind,
    rawSchemaValid: diagnosis.rawSchemaValid,
    actualIntent,
    diagnosticReason: diagnosis.reason,
    routePass: routeIsLocal,
    routeFailureReasons,
    httpStatus,
    semanticReview: "NOT_TESTED",
  });
  // Each failed request is recorded; do not retry or hide later case outcomes.
}

const intentAccuracy = intentHits / corpus.cases.length;
const rawIntentAccuracy = rawIntentHits / corpus.cases.length;
const automatedPass =
  rawIntentAccuracy >= 0.9 &&
  intentAccuracy >= 0.9 &&
  criticalFailures === 0 &&
  routeFailures === 0;
const result = {
  schemaVersion: 1,
  corpusVersion: corpus.version,
  head,
  model: configuration.model,
  transport: "direct-local-Ollama-service-only; NOT authenticated UI/server/relay acceptance",
  cases: summary,
  count: corpus.cases.length,
  heldOutCount: corpus.cases.filter((entry) => entry.split === "held-out").length,
  intentHits,
  intentAccuracy, // Legacy: accepted route accuracy, preserves existing private tooling.
  rawIntentHits,
  rawIntentAccuracy, // Model-selected intent even if subsequent guardrails reject the answer.
  rawSchemaValidCount,
  diagnosticReasonCounts,
  routeFailureReasonCounts,
  criticalFailures,
  routeFailures,
  humanSemanticReview: "NOT_TESTED",
  overall: automatedPass ? "MANUAL_SEMANTIC_AND_UI_ACCEPTANCE_REQUIRED" : "AUTOMATED_FAIL",
};
await writeFile(
  join(privateDirectory, "private-responses.json"),
  JSON.stringify(evidence, null, 2),
  { mode: 0o600, flag: "wx" },
);
await writeFile(join(privateDirectory, "redacted-results.json"), JSON.stringify(result, null, 2), {
  mode: 0o600,
  flag: "wx",
});
console.log(
  JSON.stringify({
    head,
    model: result.model,
    count: result.count,
    heldOutCount: result.heldOutCount,
    intentHits,
    intentAccuracy,
    rawIntentHits,
    rawIntentAccuracy,
    rawSchemaValidCount,
    diagnosticReasonCounts,
    routeFailureReasonCounts,
    criticalFailures,
    routeFailures,
    overall: result.overall,
    privateEvidenceDirectory: privateDirectory,
  }),
);
process.exitCode = automatedPass ? 2 : 1;
