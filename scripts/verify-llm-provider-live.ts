import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { RUNTIME_REFERENCE_CATALOG } from "../apps/web/src/runtime/referenceCatalog.ts";
import { parseScenario } from "../apps/web/src/scenarios/contentLoader.ts";
import { loadLlmProviderConfig } from "../apps/web/src/tutor/llm/config.ts";
import { OllamaProvider } from "../apps/web/src/tutor/llm/ollamaProvider.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "../apps/web/src/tutor/llm/provider.ts";
import { buildTutorContext } from "../apps/web/src/tutor/llm/tutorContext.ts";
import {
  InMemoryTutorSessionBudgetStore,
  TutorLlmService,
  type TutorLlmAnswer,
  type TutorLlmContext,
} from "../apps/web/src/tutor/llm/tutorGuardrails.ts";

// Live acceptance for the tutor LLM path (B1/#97). Sends one real tutor question through the
// production context builder, TutorLlmService guardrails and OllamaProvider, then checks that the
// model answered with a JSON object whose UiTargetRefs exist in the runtime catalog. It needs a
// reachable Ollama endpoint, so it is run by hand and is not part of `npm run check`.
//
//   LLM_BASE_URL=http://<host>:<port>/v1 npm run verify:llm-live -- gemma4:31b gemma4:e4b

const TRAINING_MODES = new Set(["explore", "guided", "challenge"]);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scenario: { type: "string", default: "vscode-basics.guided" },
    step: { type: "string", default: "open_explorer" },
    mode: { type: "string" },
    question: { type: "string", default: "Wo klicke ich, um den Explorer zu öffnen?" },
    "timeout-seconds": { type: "string", default: "600" },
  },
});

class RecordingProvider implements LlmProvider {
  readonly id: string;
  lastResponse: LlmResponse | null = null;
  private readonly inner: LlmProvider;

  constructor(inner: LlmProvider) {
    this.inner = inner;
    this.id = inner.id;
  }

  estimateMaximumCostMicros(request: LlmRequest): number {
    return this.inner.estimateMaximumCostMicros(request);
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.lastResponse = await this.inner.complete(request);
    return this.lastResponse;
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const baseConfig = loadLlmProviderConfig(process.env);
const models = positionals.length > 0 ? positionals : [baseConfig.model];
const timeoutMs = Number(values["timeout-seconds"]) * 1_000;
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`Invalid --timeout-seconds: ${values["timeout-seconds"]}`);
}
const maxOutputTokens = Number(process.env["LLM_MAX_OUTPUT_TOKENS"] ?? 500);

const scenario = parseScenario(
  JSON.parse(
    await readFile(resolve(process.cwd(), "content/scenarios", `${values.scenario}.json`), "utf8"),
  ),
);
const mode = values.mode ?? scenario.mode;
if (!TRAINING_MODES.has(mode)) throw new Error(`Invalid training mode: ${mode}`);
const context = buildTutorContext(scenario, mode as TutorLlmContext["mode"], values.step);

const catalogRefs = new Set(
  RUNTIME_REFERENCE_CATALOG.flatMap((runtime) => runtime.surface.map((entry) => entry.ref)),
);
const endpoint = new URL(baseConfig.baseUrl);
// A proxy in front of Ollama may forward to a cloud upstream; these headers show where it routed.
const ROUTE_HEADERS = ["server", "via", "x-ollama-account", "x-ollama-route"];

function fetchRecordingRoute(routeHeaders: string[]): typeof fetch {
  return async (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await fetch(input, { ...init, signal });
    for (const name of ROUTE_HEADERS) {
      const value = response.headers.get(name);
      if (value) routeHeaders.push(`${name}: ${value}`);
    }
    return response;
  };
}

async function verifyModel(model: string): Promise<boolean> {
  const routeHeaders: string[] = [];
  const provider = new RecordingProvider(
    new OllamaProvider({ ...baseConfig, model }, fetchRecordingRoute(routeHeaders)),
  );
  const service = new TutorLlmService({
    provider,
    budgetStore: new InMemoryTutorSessionBudgetStore(),
    policy: { maxRequests: 1, maxCostMicros: 0, maxOutputTokens },
    auditLogger: () => {},
  });

  console.log(`\n### ${model}\n`);
  const startedAt = performance.now();
  let answer: TutorLlmAnswer;
  try {
    answer = await service.answer({
      sessionKey: `verify:${model}`,
      context,
      question: { question: values.question },
      includeUserCode: false,
    });
  } catch (error) {
    console.log(
      `- [ ] Provider-Anfrage: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  const seconds = ((performance.now() - startedAt) / 1_000).toFixed(1);
  const raw = provider.lastResponse;
  const json = raw ? parseJsonObject(raw.text) : null;
  // Judge the refs the model actually sent; the guardrails replace rejected refs with an empty list.
  const sentRefs = json?.["uiTargetRefs"];
  const modelRefs = Array.isArray(sentRefs)
    ? sentRefs.filter((ref): ref is string => typeof ref === "string")
    : [];
  const checks: Array<[string, boolean]> = [
    ["Antwort ist ein JSON-Objekt", json !== null],
    ["Guardrails nehmen die Antwort an (Status `ok`)", answer.status === "ok"],
    ["mindestens eine UiTargetRef", modelRefs.length > 0],
    [
      "alle UiTargetRefs im Runtime-Katalog",
      modelRefs.length > 0 && modelRefs.every((ref) => catalogRefs.has(ref)),
    ],
  ];

  console.log(`- Modell laut Antwort: ${raw?.model ?? "–"}`);
  console.log(
    `- Dauer: ${seconds} s · Tokens ein/aus: ${raw?.usage.inputTokens ?? "–"}/${raw?.usage.outputTokens ?? "–"}`,
  );
  console.log(`- Antwort-Header: ${routeHeaders.join(" · ") || "–"}`);
  console.log(`- UiTargetRefs laut Modell: ${modelRefs.join(", ") || "–"}`);
  for (const [label, passed] of checks) console.log(`- [${passed ? "x" : " "}] ${label}`);
  if (raw) console.log(`\n\`\`\`json\n${raw.text.trim()}\n\`\`\``);
  return checks.every(([, passed]) => passed);
}

console.log(`## Tutor-LLM Live-Abnahme — ${new Date().toISOString()}\n`);
console.log(`- Endpunkt: ${endpoint.origin}${endpoint.pathname}`);
console.log(`- Szenario / Schritt / Modus: ${values.scenario} / ${values.step} / ${mode}`);
console.log(`- Erlaubte UiTargetRefs: ${context.allowedUiTargetRefs.join(", ") || "–"}`);
console.log(`- Frage: ${values.question}`);

// Sequential on purpose: two large models loaded at once would distort the GPU evidence.
let failed = false;
for (const model of models) {
  if (!(await verifyModel(model))) failed = true;
}
process.exitCode = failed ? 1 : 0;
