import type { WorkspaceEvent, WorkspaceEventName } from "../types/training.ts";

type Handler = (event: WorkspaceEvent) => void;

/**
 * Minimal runtime-agnostic event bus. The simulated workspace emits events here;
 * the training engine subscribes. Real runtime adapters (VSCodeRuntimeAdapter,
 * TerminalRuntimeAdapter, M365RuntimeAdapter) can later emit the same events.
 */
export class EventBus {
  private handlers = new Set<Handler>();

  emit(name: WorkspaceEventName, payload: Record<string, unknown> = {}) {
    const event: WorkspaceEvent = { name, payload };
    this.handlers.forEach((h) => h(event));
  }

  subscribe(handler: Handler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export const workspaceBus = new EventBus();
