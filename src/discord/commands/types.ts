import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  User,
} from 'discord.js';
import type { Translator } from '../../localization/resolver.js';
import type { Logger } from '../../logging/logger.js';

/**
 * Union of discord.js slash command builder variants supported by Circe.
 *
 * @public
 */
export type CommandBuilder =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

/**
 * The outcome of a guard evaluation: `true` to permit execution, or a string denial reason.
 *
 * @public
 */
export type GuardResult = true | string;

/**
 * A composable precondition evaluated before a command executes.
 *
 * @param ctx - The execution context for the incoming command interaction.
 * @returns `true` to allow execution, or a descriptive string explaining the denial.
 *
 * @public
 */
export type Guard = (ctx: CommandContext) => GuardResult | Promise<GuardResult>;

/**
 * Execution context provided to slash command handlers.
 *
 * @public
 */
export interface CommandContext {
  /** The raw discord.js interaction instance — never hidden or obscured. */
  readonly interaction: ChatInputCommandInteraction;
  /** The active discord.js client instance. */
  readonly client: Client;
  /** The Discord guild where the command was executed, or `null` if executed in DMs. */
  readonly guild: Guild | null;
  /** The invoking guild member, or `null` if executed in DMs or uncached. */
  readonly member: GuildMember | null;
  /** The Discord user who triggered the interaction. */
  readonly user: User;
  /** Context-scoped logger carrying interaction metadata and correlation ID. */
  readonly logger: Logger;
  /** Unique UUID v4 correlation ID tracing this interaction through logs and telemetry. */
  readonly correlationId: string | undefined;
  /** Translates strings for the interaction's locale using the configured localization resolver. */
  readonly t: Translator;
}

/**
 * Execution context provided to command autocomplete handlers.
 *
 * @public
 */
export interface AutocompleteContext {
  /** The raw discord.js autocomplete interaction instance. */
  readonly interaction: AutocompleteInteraction;
  /** The active discord.js client instance. */
  readonly client: Client;
  /** The Discord guild where the autocomplete request originated, or `null` if in DMs. */
  readonly guild: Guild | null;
  /** Context-scoped logger carrying autocomplete metadata and correlation ID. */
  readonly logger: Logger;
  /** Unique UUID v4 correlation ID tracing this request. */
  readonly correlationId: string | undefined;
  /** Translates strings for the interaction's locale. */
  readonly t: Translator;
}

/**
 * Handles incoming option autocomplete requests for a slash command.
 *
 * @param ctx - The autocomplete context providing interaction and helpers.
 *
 * @public
 */
export type AutocompleteHandler = (ctx: AutocompleteContext) => void | Promise<void>;

/**
 * Declaration contract for a slash command module.
 *
 * @typeParam Metadata - Bot-defined custom metadata attached to the command definition.
 *
 * @public
 */
export interface CommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> {
  /** Slash command builder configuring the command name, description, and options. */
  readonly builder: CommandBuilder;
  /** Optional sequence of guards evaluated sequentially before execution. */
  readonly guards?: readonly Guard[];
  /** Optional autocomplete handler for autocompletable options declared in the builder. */
  readonly autocomplete?: AutocompleteHandler;
  /** Optional bot-owned custom metadata attached to this command definition. */
  readonly metadata?: Metadata;
  /** Core execution logic invoked when the command is called and all guards pass. */
  execute(ctx: CommandContext): void | Promise<void>;
}

/**
 * Identity helper for declaring a slash command module with strict TypeScript inference.
 *
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @param definition - The command specification.
 * @returns The validated command definition.
 *
 * @example
 * ```typescript
 * import { SlashCommandBuilder } from 'discord.js';
 * import { defineCommand } from '@sxnnyside/circe';
 *
 * export default defineCommand({
 *   builder: new SlashCommandBuilder().setName('ping').setDescription('Replies with pong'),
 *   execute(ctx) {
 *     return ctx.interaction.reply('Pong!');
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineCommand<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: CommandDefinition<Metadata>,
): CommandDefinition<Metadata> {
  return definition;
}
