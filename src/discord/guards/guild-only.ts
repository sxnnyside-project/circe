import type { Guard } from "../commands/types.js";

/** Blocks execution outside of a guild. The generic mechanism only — no notion of which guild. */
export function guildOnly(): Guard {
  return (ctx) => (ctx.guild ? true : "This command can only be used in a server.");
}
