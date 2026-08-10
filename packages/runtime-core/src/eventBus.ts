import type { WorkspaceEvent, WorkspaceEventName } from "@ai-train-lab/training-engine";

export {
  InProcessTrainingEventBus,
  createTrainingEvent,
  type TelemetrySink,
  type TrainingEventBus,
  type TrainingEventHandler,
} from "@ai-train-lab/training-engine";

type Handler = (event: WorkspaceEvent) => void;

/**
 * Transitional simulator-internal bus. Runtime adapters translate these events
 * into canonical TrainingEvent objects at their public subscribe boundary.
 */
export class EventBus {
  private readonly handlers = new Set<Handler>();

  emit(name: WorkspaceEventName, payload: Record<string, unknown> = {}): void {
    const event: WorkspaceEvent = { name, payload };
    this.handlers.forEach((handler) => handler(event));
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export const workspaceBus = new EventBus();
