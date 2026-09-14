export interface LlmProviderConfig {
  provider: "ollama";
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Amplify ends SSR requests after 30 s; giving up earlier leaves the answer to the deterministic tutor. */
  timeoutMs: number;
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_OLLAMA_MODEL = "gemma4:31b";
const DEFAULT_TIMEOUT_MS = 25_000;

export function loadLlmProviderConfig(env: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  const provider = env["LLM_PROVIDER"]?.trim() || "ollama";
  if (provider !== "ollama") {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  return {
    provider,
    baseUrl: normalizeBaseUrl(env["LLM_BASE_URL"]?.trim() || DEFAULT_OLLAMA_BASE_URL),
    model: env["LLM_MODEL"]?.trim() || DEFAULT_OLLAMA_MODEL,
    apiKey: env["LLM_API_KEY"]?.trim() || "ollama",
    timeoutMs: positiveInteger(env["LLM_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS),
  };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
