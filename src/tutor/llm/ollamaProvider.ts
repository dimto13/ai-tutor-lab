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
}

export class OllamaProvider implements LlmProvider {
  readonly id = "ollama";

  constructor(
    private readonly config: LlmProviderConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

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
    };
  }
}
