import type { LlmProvider, LlmRequest, LlmResponse } from "./provider";
import type { LlmProviderConfig } from "./config";

type FetchLike = typeof fetch;

interface OpenAiChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export class OllamaProvider implements LlmProvider {
  readonly id = "ollama";
  private readonly config: LlmProviderConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: LlmProviderConfig, fetchImpl: FetchLike = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  estimateMaximumCostMicros(_request: LlmRequest): number {
    // The supported Ollama path is locally operated and has no per-request provider charge.
    return 0;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
        ...(request.structuredOutput ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM provider request failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as OpenAiChatCompletionResponse;
    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("LLM provider returned no message content");
    }

    return {
      text,
      model: payload.model || this.config.model,
      usage: {
        inputTokens: tokenCount(payload.usage?.prompt_tokens),
        outputTokens: tokenCount(payload.usage?.completion_tokens),
        costMicros: 0,
      },
    };
  }
}
