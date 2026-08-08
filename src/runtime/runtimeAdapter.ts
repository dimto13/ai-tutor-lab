import type { UiTargetRef, WorkspaceEvent } from "../types/training.ts";

export type RuntimeCapability =
  | "filesystem"
  | "editor"
  | "terminal"
  | "extensions"
  | "source_control"
  | "chat"
  | "inline_completion"
  | "agent_mode";

export type RuntimeSeed = Record<string, unknown>;

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

  subscribe(handler: (event: WorkspaceEvent) => void): () => void;
  query<T = unknown>(selector: string): Promise<T>;
  resolveTarget(ref: UiTargetRef): DOMRect | null;
  describeSurface(): RuntimeSurfaceDescription[];
  snapshot(): Promise<unknown>;
  restore(snapshot: unknown): Promise<void>;

  /** Transitional simulator helper until session restore owns reset semantics. */
  reset?(): void;
}
