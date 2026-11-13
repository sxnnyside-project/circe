import type { LocalizationMap, SlashCommandSubcommandBuilder } from 'discord.js';
import type { CommandContext, Guard } from '../types.js';

/**
 * Declaration contract for a command group's `_group.ts` manifest.
 *
 * @typeParam Metadata - Bot-defined custom metadata attached to the group.
 *
 * @public
 */
export interface CommandGroupDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> {
  /** The group or command name in Discord (matches folder name). */
  readonly name: string;
  /** Description shown in Discord's UI for this command group. */
  readonly description: string;
  /** Localized names for the command group across Discord client languages. */
  readonly nameLocalizations?: LocalizationMap;
  /** Localized descriptions for the command group across Discord client languages. */
  readonly descriptionLocalizations?: LocalizationMap;
  /**
   * Guards evaluated before any child subcommand executes.
   *
   * @remarks
   * Serves as a gate for the entire group hierarchy (e.g. staff-only group).
   */
  readonly guards?: readonly Guard[];
  /** Optional bot-owned custom metadata attached to this group definition. */
  readonly metadata?: Metadata;
}

/**
 * Identity helper for declaring a command group's `_group.ts` manifest with strict inference.
 *
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @param definition - The command group specification.
 * @returns The validated command group definition.
 *
 * @example
 * ```typescript
 * import { defineCommandGroup } from '@sxnnyside/circe';
 *
 * export default defineCommandGroup({
 *   name: 'admin',
 *   description: 'Administrative server management commands',
 * });
 * ```
 *
 * @public
 */
export function defineCommandGroup<
  Metadata extends Record<string, unknown> = Record<string, never>,
>(definition: CommandGroupDefinition<Metadata>): CommandGroupDefinition<Metadata> {
  return definition;
}

/**
 * Declaration contract for an individual subcommand leaf file under a group folder.
 *
 * @typeParam Metadata - Bot-defined custom metadata attached to the subcommand.
 *
 * @public
 */
export interface SubcommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> {
  /** Builder defining the subcommand's options and parameters. */
  readonly builder: SlashCommandSubcommandBuilder;
  /** Optional sequence of guards evaluated specifically for this subcommand. */
  readonly guards?: readonly Guard[];
  /** Optional bot-owned custom metadata attached to this subcommand. */
  readonly metadata?: Metadata;
  /** Core execution logic invoked when this subcommand is selected. */
  execute(ctx: CommandContext): void | Promise<void>;
}

/**
 * Identity helper for declaring a leaf subcommand under `command-groups/` with strict inference.
 *
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @param definition - The subcommand specification.
 * @returns The validated subcommand definition.
 *
 * @example
 * ```typescript
 * import { SlashCommandSubcommandBuilder } from 'discord.js';
 * import { defineSubcommand } from '@sxnnyside/circe';
 *
 * export default defineSubcommand({
 *   builder: new SlashCommandSubcommandBuilder()
 *     .setName('kick')
 *     .setDescription('Kicks a user from the guild'),
 *   execute(ctx) { ... }
 * });
 * ```
 *
 * @public
 */
export function defineSubcommand<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: SubcommandDefinition<Metadata>,
): SubcommandDefinition<Metadata> {
  return definition;
}
