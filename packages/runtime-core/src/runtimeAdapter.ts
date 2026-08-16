import type {
  RuntimeRecoveryCommand,
  RuntimeSeed,
  TrainingEvent,
  UiTargetRef,
} from "@ai-train-lab/training-engine";

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

export interface RuntimeStateChange {
  /** Open reason vocabulary so concrete runtimes can expose lifecycle/mutation signals. */
  reason: string;
}

export interface RuntimeRecoveryResult {
  status: "repaired" | "unsupported";
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
  /** Optional product-neutral signal used to re-evaluate declarative state recovery rules. */
  subscribeStateChange?(handler: (change: RuntimeStateChange) => void): () => void;
  query<T = unknown>(selector: string): Promise<T>;
  resolveTarget(ref: UiTargetRef): DOMRect | null;
  describeSurface(): RuntimeSurfaceDescription[];
  snapshot(): Promise<unknown>;
  restore(snapshot: unknown): Promise<void>;
  /** Optional semantic repair command interpreted only by the concrete runtime adapter. */
  recover?(command: RuntimeRecoveryCommand): Promise<RuntimeRecoveryResult>;

  /** Transitional simulator helper until session restore owns reset semantics. */
  reset?(): void;
}