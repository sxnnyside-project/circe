import type { Guild } from 'discord.js';
import type { GuardResult } from '../commands/types.js';

/**
 * Context slice required by the {@link guildOnly} guard.
 *
 * @public
 */
export interface GuildContext {
  /** The Discord guild where the interaction occurred, or `null` if in DMs. */
  readonly guild: Guild | null;
}

/**
 * Creates a guard that restricts interaction execution exclusively to guilds (servers), blocking direct messages.
 *
 * @returns A guard function returning `true` within a guild, or a standard denial string outside of one.
 *
 * @example
 * ```typescript
 * import { defineCommand, guildOnly } from '@sxnnyside/circe';
 *
 * export default defineCommand({
 *   builder: ...,
 *   guards: [guildOnly()],
 *   execute(ctx) { ... }
 * });
 * ```
 *
 * @public
 */
export function guildOnly(): (ctx: GuildContext) => GuardResult {
  return (ctx) => (ctx.guild ? true : 'This command can only be used in a server.');
}
