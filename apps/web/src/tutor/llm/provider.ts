export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature?: number;
  structuredOutput?: boolean;
  maxOutputTokens?: number;
}

export interface LlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  costMicros: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage: LlmUsage;
}

/**
 * Provider-neutral server boundary. A provider must expose a conservative maximum cost estimate
 * before execution so the caller can enforce a server-side session budget without provider
 * branches in the guardrail layer.
 */
export interface LlmProvider {
  readonly id: string;
  estimateMaximumCostMicros(request: LlmRequest): number;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
