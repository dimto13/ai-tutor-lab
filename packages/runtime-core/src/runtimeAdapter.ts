import type {
  RuntimePathComparison,
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

export interface RuntimeEnvironmentSemantics {
  /** Product-neutral identity semantics for filesystem paths and filenames only. */
  readonly pathComparison: RuntimePathComparison;
}

/**
 * Without a declared profile, paths stay case-sensitive. The platform never
 * guesses a profile from a product, OS or host name.
 */
export const DEFAULT_RUNTIME_PATH_COMPARISON: RuntimePathComparison = "case-sensitive";

export const DEFAULT_RUNTIME_ENVIRONMENT_SEMANTICS: RuntimeEnvironmentSemantics = {
  pathComparison: DEFAULT_RUNTIME_PATH_COMPARISON,
};

/**
 * Resolves the active semantics from the declared profiles, most specific first:
 * the scenario environment wins over the runtime's own default.
 */
export function resolveRuntimeEnvironmentSemantics(
  ...declared: readonly (RuntimePathComparison | undefined)[]
): RuntimeEnvironmentSemantics {
  const comparison = declared.find((value): value is RuntimePathComparison => Boolean(value));
  return { pathComparison: comparison ?? DEFAULT_RUNTIME_PATH_COMPARISON };
}

export type { RuntimeSeed } from "@ai-train-lab/training-engine";
// Path identity lives in the engine so the engine can compare without depending
// on this package; re-exported here as the runtime-facing contract.
export {
  findRuntimePath,
  matchesRuntimePath,
  type RuntimePathComparison,
  type RuntimePathIdentity,
} from "@ai-train-lab/training-engine";

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
  /**
   * Active environment semantics. This is a method, not a property: adapters in
   * this codebase are composed by object spread, and a spread would freeze a
   * getter-backed property to its value at module load.
   */
  resolveEnvironment?(): RuntimeEnvironmentSemantics;
  /**
   * Optional hook for the platform to apply the resolved environment profile.
   * Runtimes that have no path-identity behaviour omit it.
   */
  applyEnvironment?(semantics: RuntimeEnvironmentSemantics): void;

  /**
   * Mounting is the lifecycle point that owns the environment: `unmount`
   * restores the strict default so no scenario inherits a profile, so whoever
   * mounts passes the resolved semantics along and a remount re-establishes
   * them. `applyEnvironment` stays for runtimes the platform does not mount.
   */
  mount(
    container: HTMLElement,
    seed?: RuntimeSeed,
    environment?: RuntimeEnvironmentSemantics,
  ): Promise<void>;
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
