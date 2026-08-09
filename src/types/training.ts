export type StepStatus = "NOT_STARTED" | "ACTIVE" | "COMPLETED" | "SKIPPED" | "VALIDATION_FAILED";

export type TrainingMode = "explore" | "guided" | "challenge";
export type LearningLayer = "tool" | "concept" | "ai_workflow";
export type TechnologyId =
  | "ide"
  | "source_control"
  | "terminal"
  | "ai_coding_assistant"
  | "cli_agent"
  | "office_assistant"
  | "ai_chat";
export type TrainingStepType = "action" | "explanation";
export type ChallengeOutcome = "active" | "passed" | "timed_out";
export type UiTargetRef = string;
export type RuntimeSeed = Record<string, unknown>;

export type WorkspaceEventName =
  | "explorer.opened"
  | "folder.opened"
  | "workspace.opened"
  | "repository.opened"
  | "file.created"
  | "file.updated"
  | "file.saved"
  | "terminal.opened"
  | "terminal.command.executed"
  | "panel.opened"
  | "copilot.enabled.changed"
  | "copilot.chat.opened"
  | "copilot.conversation.started"
  | "copilot.prompt.submitted"
  | "copilot.mode.changed"
  | "copilot.model.changed"
  | "copilot.context.changed"
  | "ai.suggestion.shown"
  | "ai.suggestion.accepted"
  | "ai.suggestion.rejected"
  | "ui.element.inspected";

/** Transitional simulator-internal event shape. Runtime adapters expose TrainingEvent instead. */
export interface WorkspaceEvent {
  name: WorkspaceEventName;
  payload?: Record<string, unknown>;
}

/** Canonical event crossing the runtime/training boundary. */
export interface TrainingEvent<P = unknown> {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  sessionId: string;
  payload: P;
}

export interface ValidationResult {
  ok: boolean;
  /** Message shown in the guide panel when the action was close but wrong. */
  message?: string;
}

export type Validation =
  | {
      kind: "event";
      type: WorkspaceEventName;
      match?: Record<string, unknown>;
      contains?: Record<string, string>;
    }
  | {
      kind: "state";
      selector: string;
      equals?: unknown;
      includes?: unknown;
      excludes?: unknown;
      match?: Record<string, unknown>;
    }
  | {
      kind: "all";
      of: Validation[];
    };

export interface TrainingStep {
  id: string;
  /** Only explicitly marked explanation steps may advance without a RuntimeEvent. */
  stepType?: TrainingStepType;
  title: string;
  description: string;
  instruction: string;
  why: string;
  /** 3 escalating help levels: hint, concrete instruction, visual help. */
  helpLevels: [string, string, string];
  /** Transitional POC event contract; new content should prefer `validation`. */
  expectedEvent?: WorkspaceEventName;
  validation?: Validation;
  /** Semantic UI reference, never a CSS selector. */
  highlightTarget?: UiTargetRef;
  highlightTooltip?: string;
  successMessage: string;
  /** Optional content can be skipped through an explicit learner choice. */
  optional?: boolean;
  /** Transitional compatibility for the older Git/Copilot POC scenario. */
  validate?: (payload: Record<string, unknown>) => ValidationResult;
}

export interface ScenarioAudience {
  /** Stable reference into the declarative learner-persona catalog. */
  personaId: string;
  /** Glossary concepts that this scenario introduces and renders inline. */
  glossaryConcepts: string[];
  /** Optional explanation steps that form a skippable introduction block. */
  introductionStepIds?: string[];
}

export interface ScenarioIntegrationEnvironment {
  productId: string;
  version: string;
  runtimeAdapterId: string;
}

export interface ScenarioEnvironment {
  productId: string;
  version: string;
  runtimeAdapterId: string;
  /** Version-pinned product integrations hosted inside the primary runtime surface. */
  integrations?: ScenarioIntegrationEnvironment[];
  /** Derived by parseScenario for runtime consumers; never authored in scenario JSON. */
  integrationRuntimeAdapterIds?: string[];
  seed?: RuntimeSeed;
}

export interface LearningResource {
  title: string;
  description?: string;
  url: string;
  kind: "official" | "video" | "reference";
  verifiedAt?: string;
}

export interface Scenario {
  id: string;
  moduleId?: string;
  mode?: TrainingMode;
  learningLayer?: LearningLayer;
  title: string;
  description: string;
  learningObjectives?: string[];
  audience?: ScenarioAudience;
  environment?: ScenarioEnvironment;
  estimatedMinutes?: number;
  /** Base points before the mode multiplier is applied. */
  points?: number;
  /** Optional hard deadline for challenge scenarios. */
  timeLimitSeconds?: number;
  /** Maintained learning links, kept outside React components. */
  resources?: LearningResource[];
  /** Explore mode: semantic targets that must be inspected. */
  exploreTargets?: UiTargetRef[];
  /** Challenge mode: final-state validation, independent of click order. */
  completionValidation?: Validation;
  /** Shown after a successful challenge as a reference solution. */
  solutionComparison?: string[];
  steps: TrainingStep[];
}
