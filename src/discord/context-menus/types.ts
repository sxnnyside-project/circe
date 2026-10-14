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
import type { Translator } from '../../i18n/translator.js';
import type { Logger } from '../../logging/logger.js';
import type { GuardResult } from '../commands/types.js';

export type { GuardResult };

export interface UserContextMenuCommandContext {
  readonly interaction: UserContextMenuCommandInteraction;
  readonly client: Client;
  readonly guild: Guild | null;
  readonly member: GuildMember | null;
  /** The user the menu action was invoked on — `GuildMember` when resolvable in a guild, otherwise the bare `User`. */
  readonly target: GuildMember | User;
  readonly user: User;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
  /** Translates `key` for `interaction.locale` via whichever `I18nResolver` the bot configured (see i18n.ts). Returns `key` verbatim when none is configured. */
  readonly t: Translator;
}

export interface MessageContextMenuCommandContext {
  readonly interaction: MessageContextMenuCommandInteraction;
  readonly client: Client;
  readonly guild: Guild | null;
  readonly member: GuildMember | null;
  /** The message the menu action was invoked on. */
  readonly target: Message;
  readonly user: User;
  /** Translates `key` for `interaction.locale` via whichever `I18nResolver` the bot configured (see i18n.ts). Returns `key` verbatim when none is configured. */
  readonly t: Translator;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
}

/**
 * Registration-time properties Discord enforces itself, before the menu
 * entry is even shown. Context menus have no `builder`, so these are the
 * only way to set them; Circe applies them when it registers the command.
 */
export interface ContextMenuRegistrationOptions {
  /** Hides the entry from members lacking these permissions. `0n` restricts it to administrators; `null` clears any restriction. */
  readonly defaultMemberPermissions?: PermissionResolvable | null;
  /** Where the command can be used (guild, bot DM, private channel). */
  readonly contexts?: readonly InteractionContextType[];
  /** Which installation types expose the command (guild install, user install). */
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  readonly nameLocalizations?: LocalizationMap;
}

export type UserCommandGuard = (
  ctx: UserContextMenuCommandContext,
) => GuardResult | Promise<GuardResult>;

export interface UserCommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> extends ContextMenuRegistrationOptions {
  readonly name: string;
  readonly guards?: readonly UserCommandGuard[];
  readonly metadata?: Metadata;
  execute(ctx: UserContextMenuCommandContext): void | Promise<void>;
}

/** Identity helper — same purpose as `defineCommand`. */
export function defineUserCommand<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: UserCommandDefinition<Metadata>,
): UserCommandDefinition<Metadata> {
  return definition;
}

export type MessageCommandGuard = (
  ctx: MessageContextMenuCommandContext,
) => GuardResult | Promise<GuardResult>;

export interface MessageCommandDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
> extends ContextMenuRegistrationOptions {
  readonly name: string;
  readonly guards?: readonly MessageCommandGuard[];
  readonly metadata?: Metadata;
  execute(ctx: MessageContextMenuCommandContext): void | Promise<void>;
}

/** Identity helper — same purpose as `defineCommand`. */
export function defineMessageCommand<
  Metadata extends Record<string, unknown> = Record<string, never>,
>(definition: MessageCommandDefinition<Metadata>): MessageCommandDefinition<Metadata> {
  return definition;
}
