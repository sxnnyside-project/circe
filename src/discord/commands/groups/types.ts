import type { SlashCommandSubcommandBuilder } from 'discord.js';
import type { CommandContext, Guard } from '../types.js';

export interface CommandGroupDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> {
  readonly name: string;
  readonly description: string;
  /** Run before any child subcommand's own guards — a precondition for the whole group, not a substitute for a leaf's specific ones. */
  readonly guards?: readonly Guard[];
  readonly metadata?: Metadata;
}

/** Identity helper for a group folder's `_group.ts` — same purpose as `defineCommand`. */
export function defineCommandGroup<
  Metadata extends Record<string, unknown> = Record<string, never>,
>(definition: CommandGroupDefinition<Metadata>): CommandGroupDefinition<Metadata> {
  return definition;
}

export interface SubcommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> {
  readonly builder: SlashCommandSubcommandBuilder;
  readonly guards?: readonly Guard[];
  readonly metadata?: Metadata;
  execute(ctx: CommandContext): void | Promise<void>;
}

/** Identity helper for a leaf file under `command-groups/` — same purpose as `defineCommand`. */
export function defineSubcommand<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: SubcommandDefinition<Metadata>,
): SubcommandDefinition<Metadata> {
  return definition;
}
