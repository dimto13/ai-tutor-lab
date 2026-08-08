export interface LlmProviderConfig {
  provider: "ollama";
  baseUrl: string;
  model: string;
  apiKey: string;
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_OLLAMA_MODEL = "gemma4:31b";

export function loadLlmProviderConfig(env: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  const provider = env.LLM_PROVIDER?.trim() || "ollama";
  if (provider !== "ollama") {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  return {
    provider,
    baseUrl: normalizeBaseUrl(env.LLM_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL),
    model: env.LLM_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    apiKey: env.LLM_API_KEY?.trim() || "ollama",
  };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
