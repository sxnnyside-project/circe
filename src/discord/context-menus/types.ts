import type {
  ApplicationIntegrationType,
  Client,
  Guild,
  GuildMember,
  InteractionContextType,
  LocalizationMap,
  Message,
  MessageContextMenuCommandInteraction,
  PermissionResolvable,
  User,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import type { Translator } from '../../localization/resolver.js';
import type { Logger } from '../../logging/logger.js';
import type { GuardResult } from '../commands/types.js';

export type { GuardResult };

/**
 * Execution context provided to User Context Menu command handlers.
 *
 * @public
 */
export interface UserContextMenuCommandContext {
  /** The raw discord.js UserContextMenuCommandInteraction instance. */
  readonly interaction: UserContextMenuCommandInteraction;
  /** The active discord.js client instance. */
  readonly client: Client;
  /** The Discord guild where the action was invoked, or `null` if in DMs. */
  readonly guild: Guild | null;
  /** The invoking guild member, or `null` if in DMs or uncached. */
  readonly member: GuildMember | null;
  /**
   * The targeted user — resolved as `GuildMember` when invoked within a guild, otherwise `User`.
   */
  readonly target: GuildMember | User;
  /** The invoking user who selected the context menu option. */
  readonly user: User;
  /** Context-scoped logger carrying interaction metadata and correlation ID. */
  readonly logger: Logger;
  /** Unique UUID v4 correlation ID tracing this interaction. */
  readonly correlationId: string | undefined;
  /** Translates strings for the interaction's locale. */
  readonly t: Translator;
}

/**
 * Execution context provided to Message Context Menu command handlers.
 *
 * @public
 */
export interface MessageContextMenuCommandContext {
  /** The raw discord.js MessageContextMenuCommandInteraction instance. */
  readonly interaction: MessageContextMenuCommandInteraction;
  /** The active discord.js client instance. */
  readonly client: Client;
  /** The Discord guild where the action was invoked, or `null` if in DMs. */
  readonly guild: Guild | null;
  /** The invoking guild member, or `null` if in DMs or uncached. */
  readonly member: GuildMember | null;
  /** The targeted message the user right-clicked on. */
  readonly target: Message;
  /** The invoking user who selected the context menu option. */
  readonly user: User;
  /** Translates strings for the interaction's locale. */
  readonly t: Translator;
  /** Context-scoped logger carrying interaction metadata and correlation ID. */
  readonly logger: Logger;
  /** Unique UUID v4 correlation ID tracing this interaction. */
  readonly correlationId: string | undefined;
}

/**
 * Registration options applied by Discord REST API when deploying context menu commands.
 *
 * @public
 */
export interface ContextMenuRegistrationOptions {
  /** Restricts visibility in Discord UI to members holding these permissions. */
  readonly defaultMemberPermissions?: PermissionResolvable | null;
  /** Interaction contexts where the command can be used (guilds, bot DMs, group DMs). */
  readonly contexts?: readonly InteractionContextType[];
  /** Installation targets that expose this command (guild install, user install). */
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  /** Localized command names across Discord client languages. */
  readonly nameLocalizations?: LocalizationMap;
}

/**
 * A composable precondition evaluated before a user context menu command executes.
 *
 * @param ctx - The user context menu execution context.
 * @returns `true` to permit execution, or a descriptive string explaining denial.
 *
 * @public
 */
export type UserCommandGuard = (
  ctx: UserContextMenuCommandContext,
) => GuardResult | Promise<GuardResult>;

/**
 * Declaration contract for a User Context Menu command module (`users/` folder).
 *
 * @typeParam Metadata - Bot-defined custom metadata attached to the command definition.
 *
 * @public
 */
export interface UserCommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> extends ContextMenuRegistrationOptions {
  /** The display name of the command shown in Discord's user context menu. */
  readonly name: string;
  /** Sequence of guards evaluated before execution. */
  readonly guards?: readonly UserCommandGuard[];
  /** Optional bot-owned custom metadata attached to this definition. */
  readonly metadata?: Metadata;
  /** Core execution logic invoked when the context menu action is selected. */
  execute(ctx: UserContextMenuCommandContext): void | Promise<void>;
}

/**
 * Identity helper for declaring a User Context Menu command with strict inference.
 *
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @param definition - The user context menu specification.
 * @returns The validated user command definition.
 *
 * @example
 * ```typescript
 * import { defineUserCommand } from '@sxnnyside/circe';
 *
 * export default defineUserCommand({
 *   name: 'View Avatar',
 *   execute(ctx) {
 *     return ctx.interaction.reply({ content: ctx.target.displayAvatarURL(), flags: MessageFlags.Ephemeral });
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineUserCommand<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: UserCommandDefinition<Metadata>,
): UserCommandDefinition<Metadata> {
  return definition;
}

/**
 * Alias for {@link UserCommandDefinition} for context menu terminology consistency.
 *
 * @public
 */
export type UserContextMenuCommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> = UserCommandDefinition<Metadata>;

/**
 * A composable precondition evaluated before a message context menu command executes.
 *
 * @param ctx - The message context menu execution context.
 * @returns `true` to permit execution, or a descriptive string explaining denial.
 *
 * @public
 */
export type MessageCommandGuard = (
  ctx: MessageContextMenuCommandContext,
) => GuardResult | Promise<GuardResult>;

/**
 * Declaration contract for a Message Context Menu command module (`messages/` folder).
 *
 * @typeParam Metadata - Bot-defined custom metadata attached to the command definition.
 *
 * @public
 */
export interface MessageCommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> extends ContextMenuRegistrationOptions {
  /** The display name of the command shown in Discord's message context menu. */
  readonly name: string;
  /** Sequence of guards evaluated before execution. */
  readonly guards?: readonly MessageCommandGuard[];
  /** Optional bot-owned custom metadata attached to this definition. */
  readonly metadata?: Metadata;
  /** Core execution logic invoked when the message context menu action is selected. */
  execute(ctx: MessageContextMenuCommandContext): void | Promise<void>;
}

/**
 * Identity helper for declaring a Message Context Menu command with strict inference.
 *
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @param definition - The message context menu specification.
 * @returns The validated message command definition.
 *
 * @example
 * ```typescript
 * import { defineMessageCommand } from '@sxnnyside/circe';
 *
 * export default defineMessageCommand({
 *   name: 'Bookmark',
 *   execute(ctx) {
 *     return ctx.interaction.reply({ content: `Bookmarked: ${ctx.target.url}`, flags: MessageFlags.Ephemeral });
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineMessageCommand<
  Metadata extends Record<string, unknown> = Record<string, never>,
>(definition: MessageCommandDefinition<Metadata>): MessageCommandDefinition<Metadata> {
  return definition;
}

/**
 * Alias for {@link MessageCommandDefinition} for context menu terminology consistency.
 *
 * @public
 */
export type MessageContextMenuCommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> = MessageCommandDefinition<Metadata>;
