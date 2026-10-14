import type { ClientEvents } from 'discord.js';
import type { EventDefinition } from './types.js';

/**
 * Holds the events a Circe application knows about. Owned by the
 * application instance, not a module-level singleton.
 */
export class EventRegistry {
  #events: EventDefinition[] = [];

  register<EventName extends keyof ClientEvents>(event: EventDefinition<EventName>): void {
    this.#events.push(event as EventDefinition);
  }

  get all(): readonly EventDefinition[] {
    return [...this.#events];
  }

  get size(): number {
    return this.#events.length;
  }
}
