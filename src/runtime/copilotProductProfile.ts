import defaultProfileJson from "../../content/product-profiles/github-copilot-vscode.2026-08.json";

export type CopilotChatModeId = "ask" | "plan" | "agent";
export type CopilotModelSelection = "automatic" | "explicit";

export interface CopilotChatModeDefinition {
  id: CopilotChatModeId;
  label: string;
  description: string;
  status?: "preview";
}

export interface CopilotModelDefinition {
  id: string;
  label: string;
  provider: string;
  selection: CopilotModelSelection;
}

export interface CopilotProductProfile {
  id: string;
  productId: "github-copilot";
  hostProductId: "vscode";
  client: "vscode";
  productVersion: string;
  defaultMode: CopilotChatModeId;
  defaultModelId: string;
  chatModes: CopilotChatModeDefinition[];
  models: CopilotModelDefinition[];
  sources: Array<{
    kind: "official";
    url: string;
    verifiedAt: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChatModeId(value: unknown): value is CopilotChatModeId {
  return value === "ask" || value === "plan" || value === "agent";
}

export function parseCopilotProductProfile(value: unknown): CopilotProductProfile {
  if (!isRecord(value)) throw new TypeError("Invalid Copilot product profile");
  if (value["productId"] !== "github-copilot" || value["hostProductId"] !== "vscode") {
    throw new TypeError("Copilot product profile must target GitHub Copilot hosted in VS Code");
  }
  if (value["client"] !== "vscode") {
    throw new TypeError("Copilot product profile client must be vscode");
  }
  if (
    typeof value["id"] !== "string" ||
    typeof value["productVersion"] !== "string" ||
    !isChatModeId(value["defaultMode"]) ||
    typeof value["defaultModelId"] !== "string"
  ) {
    throw new TypeError("Copilot product profile metadata is incomplete");
  }

  const rawModes = value["chatModes"];
  if (!Array.isArray(rawModes) || rawModes.length === 0) {
    throw new TypeError("Copilot product profile requires chat modes");
  }
  const chatModes = rawModes.map((item): CopilotChatModeDefinition => {
    if (
      !isRecord(item) ||
      !isChatModeId(item["id"]) ||
      typeof item["label"] !== "string" ||
      typeof item["description"] !== "string" ||
      (item["status"] !== undefined && item["status"] !== "preview")
    ) {
      throw new TypeError("Invalid Copilot chat mode definition");
    }
    return {
      id: item["id"],
      label: item["label"],
      description: item["description"],
      ...(item["status"] === "preview" ? { status: "preview" as const } : {}),
    };
  });

  const rawModels = value["models"];
  if (!Array.isArray(rawModels) || rawModels.length === 0) {
    throw new TypeError("Copilot product profile requires model options");
  }
  const models = rawModels.map((item): CopilotModelDefinition => {
    if (
      !isRecord(item) ||
      typeof item["id"] !== "string" ||
      typeof item["label"] !== "string" ||
      typeof item["provider"] !== "string" ||
      (item["selection"] !== "automatic" && item["selection"] !== "explicit")
    ) {
      throw new TypeError("Invalid Copilot model definition");
    }
    return {
      id: item["id"],
      label: item["label"],
      provider: item["provider"],
      selection: item["selection"],
    };
  });

  if (!chatModes.some((mode) => mode.id === value["defaultMode"])) {
    throw new TypeError("Copilot default mode is not available in the product profile");
  }
  if (!models.some((model) => model.id === value["defaultModelId"])) {
    throw new TypeError("Copilot default model is not available in the product profile");
  }

  const rawSources = value["sources"];
  if (!Array.isArray(rawSources)) throw new TypeError("Copilot product profile requires sources");
  const sources = rawSources.map((item) => {
    if (
      !isRecord(item) ||
      item["kind"] !== "official" ||
      typeof item["url"] !== "string" ||
      typeof item["verifiedAt"] !== "string"
    ) {
      throw new TypeError("Invalid Copilot product profile source");
    }
    return { kind: "official" as const, url: item["url"], verifiedAt: item["verifiedAt"] };
  });

  return {
    id: value["id"],
    productId: "github-copilot",
    hostProductId: "vscode",
    client: "vscode",
    productVersion: value["productVersion"],
    defaultMode: value["defaultMode"],
    defaultModelId: value["defaultModelId"],
    chatModes,
    models,
    sources,
  };
}

export const DEFAULT_COPILOT_PRODUCT_PROFILE = parseCopilotProductProfile(defaultProfileJson);
