import { loadLlmProviderConfig } from "./config";
import { OllamaProvider } from "./ollamaProvider";
import type { LlmProvider } from "./provider";

export type { LlmMessage, LlmProvider, LlmRequest, LlmResponse } from "./provider";
export type { LlmProviderConfig } from "./config";

export function createLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const config = loadLlmProviderConfig(env);

  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config);
  }
}
