import {
  createDefaultValidatorRegistry,
  normalizeLegacyValidationResult,
  type EngineValidationResult,
  type Scenario,
  type TrainingEvent,
  type TrainingStep,
  type Validation,
} from "@ai-train-lab/training-engine";

export type AuthorTargetResolution =
  | { status: "none" }
  | { status: "missing"; target: string }
  | {
      status: "resolved";
      target: string;
      runtimeId: string;
      runtimeProductId: string;
      label: string;
    };

export interface SimulatedAuthorEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface AuthorRuntimeHandle {
  id: string;
  productId: string;
  describeSurface(): readonly { ref: string; label: string }[];
  query(key: string): Promise<unknown>;
}

export interface AuthorRuntimeLookup {
  forTarget(target: string, scenario: Scenario): AuthorRuntimeHandle | null;
  forStateKey(key: string, scenario: Scenario): AuthorRuntimeHandle | null;
}

export function resolveAuthorHighlightTarget(
  scenario: Scenario,
  step: TrainingStep,
  runtimes: AuthorRuntimeLookup,
): AuthorTargetResolution {
  const target = step.highlightTarget;
  if (!target) return { status: "none" };

  const runtime = runtimes.forTarget(target, scenario);
  if (!runtime) return { status: "missing", target };

  const surface = runtime.describeSurface().find((entry) => entry.ref === target);
  if (!surface) return { status: "missing", target };

  return {
    status: "resolved",
    target,
    runtimeId: runtime.id,
    runtimeProductId: runtime.productId,
    label: surface.label,
  };
}

export function suggestAuthorEventType(step: TrainingStep): string {
  if (step.expectedEvent) return step.expectedEvent;
  return firstEventType(step.validation) ?? "ui.element.inspected";
}

export async function simulateAuthorStepValidation(
  scenario: Scenario,
  step: TrainingStep,
  simulated: SimulatedAuthorEvent,
  runtimes: AuthorRuntimeLookup,
): Promise<EngineValidationResult> {
  const event: TrainingEvent = {
    id: "author-preview-event",
    source: "author-preview",
    type: simulated.type,
    timestamp: new Date().toISOString(),
    sessionId: "author-preview",
    payload: simulated.payload,
  };

  if (step.validation) {
    const registry = createDefaultValidatorRegistry();
    return registry.validate(step.validation, {
      event,
      events: [event],
      query: async (key) => {
        const runtime = runtimes.forStateKey(key, scenario);
        if (!runtime) {
          throw new Error(`Kein RuntimeAdapter für State-Abfrage: ${key}`);
        }
        return runtime.query(key);
      },
    });
  }

  if (step.expectedEvent) {
    return event.type === step.expectedEvent ? { outcome: "pass" } : { outcome: "ignore" };
  }

  if (step.validate) {
    return normalizeLegacyValidationResult(step.validate(simulated.payload));
  }

  return {
    outcome: "ignore",
    message: "Dieser Schritt hat keinen ausführbaren Validator.",
  };
}

function firstEventType(validation: Validation | undefined): string | null {
  if (!validation) return null;
  if (validation.kind === "event") return validation.type;
  if (validation.kind === "sequence" || validation.kind === "all" || validation.kind === "any") {
    for (const item of validation.of) {
      const eventType = firstEventType(item);
      if (eventType) return eventType;
    }
    return null;
  }
  if (validation.kind === "not") return firstEventType(validation.of);
  return null;
}
