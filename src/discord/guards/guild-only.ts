import type { Guild } from 'discord.js';
import type { GuardResult } from '../commands/types.js';

/** The slice of any interaction context this guard reads. */
export interface GuildContext {
  readonly guild: Guild | null;
}

/** Blocks execution outside of a guild. The generic mechanism only — no notion of which guild. */
export function guildOnly(): (ctx: GuildContext) => GuardResult {
  return (ctx) => (ctx.guild ? true : 'This command can only be used in a server.');
}
