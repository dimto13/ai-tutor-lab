import type { RuntimeSeed, TrainingEvent, UiTargetRef } from "@ai-train-lab/training-engine";

export type RuntimeCapability =
  | "filesystem"
  | "editor"
  | "terminal"
  | "extensions"
  | "source_control"
  | "chat"
  | "inline_completion"
  | "agent_mode"
  | "artifact_preview";

export type { RuntimeSeed } from "@ai-train-lab/training-engine";

export interface RuntimeSurfaceDescription {
  ref: UiTargetRef;
  label: string;
  conceptKey?: string;
}

/**
 * Boundary between training logic and an interactive product runtime.
 *
 * Scenarios only use semantic targets, events and state selectors. DOM access
 * stays inside the adapter so simulator and future remote runtimes can expose
 * the same contract.
 */
export interface RuntimeAdapter {
  readonly id: string;
  readonly productId: string;
  readonly capabilities: readonly RuntimeCapability[];

  mount(container: HTMLElement, seed?: RuntimeSeed): Promise<void>;
  unmount(): Promise<void>;

  subscribe(handler: (event: TrainingEvent) => void): () => void;
  query<T = unknown>(selector: string): Promise<T>;
  resolveTarget(ref: UiTargetRef): DOMRect | null;
  describeSurface(): RuntimeSurfaceDescription[];
  snapshot(): Promise<unknown>;
  restore(snapshot: unknown): Promise<void>;

  /** Transitional simulator helper until session restore owns reset semantics. */
  reset?(): void;
}
