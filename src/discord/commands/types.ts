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
} from "discord.js";
import type { Translator } from "../../i18n/translator.js";
import type { Logger } from "../../logging/logger.js";

/**
 * The subset of discord.js's slash command builders a command can use.
 * All three still expose `.name` and `.toJSON()`, which is all Circe needs.
 */
export type CommandBuilder = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

/** `true` to allow execution; a string denial reason to block it. */
export type GuardResult = true | string;

/**
 * A composable precondition run before a command executes. Circe ships the
 * mechanism (`guildOnly`, `hasPermission`); the bot supplies the policy
 * (which permissions, which roles count as staff, etc.).
 */
export type Guard = (ctx: CommandContext) => GuardResult | Promise<GuardResult>;

export interface CommandContext {
  /** The raw discord.js interaction — never hidden behind a Circe wrapper. */
  readonly interaction: ChatInputCommandInteraction;
  readonly client: Client;
  readonly guild: Guild | null;
  /** `null` when the interaction did not originate in a guild, or the member wasn't cached. */
  readonly member: GuildMember | null;
  readonly user: User;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
  /** Translates `key` for `interaction.locale` via whichever `I18nResolver` the bot configured (see i18n.ts). Returns `key` verbatim when none is configured. */
  readonly t: Translator;
}

/**
 * Context for a command's autocomplete handler. Deliberately smaller than
 * `CommandContext` — an autocomplete request has no guild member permission
 * checks to make, just "what should the choice list say right now."
 */
export interface AutocompleteContext {
  /** The raw discord.js interaction. The handler calls `.respond(choices)` on it directly — Circe never intercepts the response. */
  readonly interaction: AutocompleteInteraction;
  readonly client: Client;
  readonly guild: Guild | null;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
}

/**
 * Handles a command's autocomplete requests. Calls `ctx.interaction.respond(...)`
 * itself — same convention as `execute` calling `ctx.interaction.reply(...)` —
 * rather than Circe inventing a return-value convention discord.js doesn't have.
 */
export type AutocompleteHandler = (ctx: AutocompleteContext) => void | Promise<void>;

export interface CommandDefinition<Metadata extends Record<string, unknown> = Record<string, never>> {
  readonly builder: CommandBuilder;
  readonly guards?: readonly Guard[];
  /** Optional — most commands don't need autocomplete. Absent entirely if the command has no autocompletable options. */
  readonly autocomplete?: AutocompleteHandler;
  /**
   * A bot-owned bag for whatever it needs to attach to a command — category,
   * cooldown duration, feature flag, anything. Circe never reads this; it
   * exists so a bot's own command loader/router extensions (or its own
   * cooldown middleware) have a type-safe place to put data without fighting
   * excess-property checks on `defineCommand({...})` call sites.
   */
  readonly metadata?: Metadata;
  execute(ctx: CommandContext): void | Promise<void>;
}

/** Identity helper — exists purely for type inference/ergonomics at the call site. */
export function defineCommand<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: CommandDefinition<Metadata>,
): CommandDefinition<Metadata> {
  return definition;
}
