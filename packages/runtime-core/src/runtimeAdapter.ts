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

export type RuntimePathComparison = "case-sensitive" | "case-insensitive";

export interface RuntimeEnvironmentSemantics {
  /** Product-neutral identity semantics for filesystem paths and filenames only. */
  readonly pathComparison: RuntimePathComparison;
}

export function matchesRuntimePath(
  actual: string,
  expected: string,
  semantics: RuntimeEnvironmentSemantics,
): boolean {
  if (semantics.pathComparison === "case-insensitive") {
    return actual.toLocaleLowerCase("en-US") === expected.toLocaleLowerCase("en-US");
  }
  return actual === expected;
}

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
  /** Optional environment semantics; consumers must not infer these from product or OS names. */
  readonly environment?: RuntimeEnvironmentSemantics;

  mount(container: HTMLElement, seed?: RuntimeSeed): Promise<void>;
  unmount(): Promise<void>;

  subscribe(handler: (event: TrainingEvent) => void): () => void;
  /** Optional product-neutral signal used to re-evaluate declarative state recovery rules. */
  subscribeStateChange?(handler: (change: RuntimeStateChange) => void): () => void;
  query<T = unknown>(selector: string): Promise<T>;
  resolveTarget(ref: UiTargetRef): DOMRect | null;
  /**
   * Optional product-owned transient surfaces that currently contain a relevant
   * user action (for example an open menu, palette or dialog). Platform overlays
   * may avoid these rectangles without knowing the product's DOM structure.
   */
  resolveTransientActionRegions?(): readonly DOMRect[];
  describeSurface(): RuntimeSurfaceDescription[];
  snapshot(): Promise<unknown>;
  restore(snapshot: unknown): Promise<void>;
  /** Optional semantic repair command interpreted only by the concrete runtime adapter. */
  recover?(command: RuntimeRecoveryCommand): Promise<RuntimeRecoveryResult>;

  /** Transitional simulator helper until session restore owns reset semantics. */
  reset?(): void;
}
