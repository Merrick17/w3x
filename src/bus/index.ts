type EventHandler = (...args: any[]) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach((h) => {
      try { h(...args); } catch { /* silently ignore */ }
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}

const _bus = new EventBus();
export const bus = _bus;
