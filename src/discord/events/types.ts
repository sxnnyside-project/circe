import type { ClientEvents } from 'discord.js';

export interface EventDefinition<EventName extends keyof ClientEvents = keyof ClientEvents> {
  readonly name: EventName;
  /** Registered with `client.once` instead of `client.on` when `true`. */
  readonly once?: boolean;
  execute(...args: ClientEvents[EventName]): void | Promise<void>;
}

/** Identity helper — exists purely for type inference/ergonomics at the call site. */
export function defineEvent<EventName extends keyof ClientEvents>(
  definition: EventDefinition<EventName>,
): EventDefinition<EventName> {
  return definition;
}
