import type { ButtonInteraction, Client, Guild, GuildMember, StringSelectMenuInteraction, User } from "discord.js";
import type { Translator } from "../../i18n/translator.js";
import type { Logger } from "../../logging/logger.js";
import { compilePattern, type ParamsFromPattern } from "./pattern.js";

/** The message component interaction types Circe routes. Modals and context menus are out of scope. */
export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;

export interface ComponentContext<Interaction extends ComponentInteraction = ComponentInteraction, Params = undefined> {
  /** The raw discord.js interaction — never hidden behind a Circe wrapper. */
  readonly interaction: Interaction;
  readonly client: Client;
  readonly guild: Guild | null;
  /** `null` when the interaction did not originate in a guild, or the member wasn't cached. */
  readonly member: GuildMember | null;
  readonly user: User;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
  /** Translates `key` for `interaction.locale` via whichever `I18nResolver` the bot configured (see i18n.ts). Returns `key` verbatim when none is configured. */
  readonly t: Translator;
  /**
   * The result of this component's `parse(customId)`, if it defines one.
   * `undefined` for components that route on the prefix alone — parsing a
   * structured customId (e.g. an encoded track reference) is opt-in, not a
   * routing requirement.
   */
  readonly params: Params;
}

export interface ComponentDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
  Params = undefined,
> {
  /**
   * Matches any component interaction whose `customId` starts with this
   * string. When more than one registered prefix matches, the longest
   * (most specific) one wins — registration order never affects resolution.
   */
  readonly prefix: string;
  /** Same bot-owned metadata bag as `CommandDefinition.metadata` — Circe never reads it. */
  readonly metadata?: Metadata;
  /**
   * Optional structured-parameter extraction, run once per interaction
   * before `execute`. Circe only supplies the routing mechanism (prefix
   * match, then this callback on the full `customId`) — parsing/encoding
   * logic itself stays consumer-owned, same as `CommandBuilder` option
   * definitions. A parser that throws surfaces through the normal
   * component error boundary, same as `execute` throwing.
   */
  parse?(customId: string): Params;
  execute(ctx: ComponentContext<ComponentInteraction, Params>): void | Promise<void>;
}

export interface PatternComponentDefinition<
  Pattern extends string,
  Metadata extends Record<string, unknown> = Record<string, never>,
> {
  /**
   * A path-like route: `"ticket:close:[userId]:[action]"` — static
   * segments before the first `[param]` become the registry's match
   * prefix; each `[name]` matches exactly one colon-delimited segment and
   * is extracted into `ctx.params`, typed automatically from the pattern
   * string itself. Sugar over `prefix`/`parse`, resolved once at
   * definition time — never seen by the registry or router.
   */
  readonly pattern: Pattern;
  readonly metadata?: Metadata;
  execute(ctx: ComponentContext<ComponentInteraction, ParamsFromPattern<Pattern>>): void | Promise<void>;
}

/** Identity helper — exists purely for type inference/ergonomics at the call site. */
export function defineComponent<Metadata extends Record<string, unknown> = Record<string, never>, Params = undefined>(
  definition: ComponentDefinition<Metadata, Params>,
): ComponentDefinition<Metadata, Params>;
export function defineComponent<
  Pattern extends string,
  Metadata extends Record<string, unknown> = Record<string, never>,
>(definition: PatternComponentDefinition<Pattern, Metadata>): ComponentDefinition<Metadata, ParamsFromPattern<Pattern>>;
// biome-ignore lint/suspicious/noExplicitAny: implementation signature for the two typed overloads above
export function defineComponent(definition: any): any {
  if ("pattern" in definition) {
    const compiled = compilePattern(definition.pattern);
    return {
      prefix: compiled.prefix,
      parse: compiled.parse,
      ...(definition.metadata !== undefined ? { metadata: definition.metadata } : {}),
      execute: definition.execute,
    };
  }
  return definition;
}
