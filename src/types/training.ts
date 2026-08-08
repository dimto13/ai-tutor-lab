export type StepStatus = "NOT_STARTED" | "ACTIVE" | "COMPLETED" | "VALIDATION_FAILED";

export type WorkspaceEventName =
  | "explorer.opened"
  | "folder.opened"
  | "workspace.opened"
  | "repository.opened"
  | "file.created"
  | "file.updated"
  | "terminal.opened"
  | "terminal.command.executed"
  | "copilot.prompt.submitted";

export interface WorkspaceEvent {
  name: WorkspaceEventName;
  payload?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  /** Message shown in the guide panel when the action was close but wrong. */
  message?: string;
}

export interface TrainingStep {
  id: string;
  title: string;
  description: string;
  instruction: string;
  why: string;
  /** 3 escalating help levels: hint, concrete instruction, visual help. */
  helpLevels: [string, string, string];
  expectedEvent: WorkspaceEventName;
  /** Element marked with data-highlight="<id>" that gets spotlighted. */
  highlightTarget?: string;
  highlightTooltip?: string;
  successMessage: string;
  validate?: (payload: Record<string, unknown>) => ValidationResult;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  steps: TrainingStep[];
}
