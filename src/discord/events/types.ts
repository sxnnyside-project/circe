import type { ClientEvents } from 'discord.js';

/**
 * Declaration contract for a Discord Gateway event listener module (`events/` folder).
 *
 * @typeParam EventName - The specific Discord client event name (e.g. `'ready'`, `'guildMemberAdd'`).
 *
 * @public
 */
export interface EventDefinition<EventName extends keyof ClientEvents = keyof ClientEvents> {
  /** The Discord Gateway event identifier. */
  readonly name: EventName;
  /**
   * Whether to register this handler with `client.once` instead of `client.on`.
   * @defaultValue `false`
   */
  readonly once?: boolean;
  /**
   * Event listener callback receiving the typed Discord.js event parameters.
   *
   * @param args - Typed arguments corresponding to `ClientEvents[EventName]`.
   */
  execute(...args: ClientEvents[EventName]): void | Promise<void>;
}

/**
 * Identity helper for declaring a Discord event listener module with strict inference.
 *
 * @typeParam EventName - The specific Discord client event name.
 * @param definition - The event listener specification.
 * @returns The validated event definition.
 *
 * @example
 * ```typescript
 * import { Events } from 'discord.js';
 * import { defineEvent } from '@sxnnyside/circe';
 *
 * export default defineEvent({
 *   name: Events.GuildMemberAdd,
 *   execute(member) {
 *     console.log(`Welcome ${member.user.tag}!`);
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineEvent<EventName extends keyof ClientEvents>(
  definition: EventDefinition<EventName>,
): EventDefinition<EventName> {
  return definition;
}
