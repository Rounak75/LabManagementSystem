type EventCallback = (payload: any) => void | Promise<void>;

class DomainEventEmitter {
  private listeners: Map<string, EventCallback[]> = new Map();

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  async emit(event: string, payload: any) {
    const callbacks = this.listeners.get(event) || [];
    for (const callback of callbacks) {
      try {
        await callback(payload);
      } catch (err) {
        console.error(`[DomainEvents] Error in listener for event ${event}:`, err);
      }
    }
  }
}

export const domainEvents = new DomainEventEmitter();
