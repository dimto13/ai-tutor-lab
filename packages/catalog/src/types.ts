export type TechnologyId =
  | "ide"
  | "source_control"
  | "terminal"
  | "ai_coding_assistant"
  | "cli_agent"
  | "office_assistant"
  | "ai_chat"
  | "artifact_preview"
  | "document_classification";

export type Capability =
  | "filesystem"
  | "editor"
  | "terminal"
  | "extensions"
  | "source_control"
  | "chat"
  | "inline_completion"
  | "agent_mode"
  | "artifact_preview";

export interface Technology {
  id: TechnologyId;
  name: string;
}

export interface Provider {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  providerId: string;
  technologyId: TechnologyId;
  name: string;
  hostProductId?: string;
}

export interface ProductVersion {
  id: string;
  productId: string;
  version: string;
  capabilities: Capability[];
  runtimeAdapterIds?: string[];
}

export interface Integration {
  id: string;
  productId: string;
  hostProductId: string;
  capabilities: Capability[];
}

export interface RuntimeAdapterDefinition {
  id: string;
  productId: string;
  integrationId?: string;
  kind: "simulator" | "real";
  capabilities: Capability[];
}

export interface TechnologyCatalog {
  technologies: Technology[];
  providers: Provider[];
  products: Product[];
  productVersions: ProductVersion[];
  integrations: Integration[];
  runtimeAdapters: RuntimeAdapterDefinition[];
}
