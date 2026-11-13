import type { ClientEvents } from 'discord.js';
import type { EventDefinition } from './types.js';

/**
 * In-memory registry storing registered Discord event listeners.
 *
 * @remarks
 * Instantiated per {@link CirceApp} container rather than as a global singleton,
 * isolating event listeners across multiple application instances and test suites.
 *
 * @public
 */
export class EventRegistry {
  readonly #events: EventDefinition[] = [];

  /**
   * Registers a Discord event definition into the registry.
   *
   * @typeParam EventName - The Discord.js client event name.
   * @param event - The event definition to register.
   */
  register<EventName extends keyof ClientEvents>(event: EventDefinition<EventName>): void {
    this.#events.push(event as unknown as EventDefinition);
  }

  /**
   * All registered event definitions.
   */
  get all(): readonly EventDefinition[] {
    return [...this.#events];
  }

  /**
   * Total number of registered event definitions.
   */
  get size(): number {
    return this.#events.length;
  }
}
