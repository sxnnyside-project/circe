import type {
  ButtonInteraction,
  Client,
  Guild,
  GuildMember,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import type { Translator } from '../../localization/resolver.js';
import type { Logger } from '../../logging/logger.js';
import type { GuardResult } from '../commands/types.js';
import { compilePattern, type ParamsFromPattern } from './pattern.js';

/**
 * Union of message component interactions routed by Circe (buttons and string select menus).
 *
 * @public
 */
export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;

/**
 * Execution context provided to component interaction handlers.
 *
 * @typeParam Interaction - Specific interaction kind (`ButtonInteraction` or `StringSelectMenuInteraction`).
 * @typeParam Params - Structured parameters parsed from `customId`.
 *
 * @public
 */
export interface ComponentContext<
  Interaction extends ComponentInteraction = ComponentInteraction,
  Params = undefined,
> {
  /** The raw discord.js interaction instance. */
  readonly interaction: Interaction;
  /** The active discord.js client instance. */
  readonly client: Client;
  /** The Discord guild where the interaction occurred, or `null` if in DMs. */
  readonly guild: Guild | null;
  /** The invoking guild member, or `null` if in DMs or uncached. */
  readonly member: GuildMember | null;
  /** The Discord user who triggered the interaction. */
  readonly user: User;
  /** Context-scoped logger carrying interaction metadata and correlation ID. */
  readonly logger: Logger;
  /** Unique UUID v4 correlation ID tracing this interaction. */
  readonly correlationId: string | undefined;
  /** Translates strings for the interaction's locale using the configured localization resolver. */
  readonly t: Translator;
  /**
   * Extracted parameters from `customId` if `parse(customId)` or `pattern` was defined; otherwise `undefined`.
   */
  readonly params: Params;
}

/**
 * A composable precondition evaluated before a component handler executes.
 *
 * @typeParam Params - Parameter structure extracted from `customId`.
 *
 * @public
 */
export type ComponentGuard<Params = undefined> = {
  bivarianceHack(
    ctx: ComponentContext<ComponentInteraction, Params>,
  ): GuardResult | Promise<GuardResult>;
}['bivarianceHack'];

/**
 * Declaration contract for a prefix-based component handler.
 *
 * @typeParam Metadata - Bot-defined custom metadata attached to the component.
 * @typeParam Params - Parsed parameters extracted from `customId`.
 *
 * @public
 */
export interface ComponentDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
  Params = undefined,
> {
  /**
   * Matches any component interaction whose `customId` starts with this prefix.
   * Longest prefix wins in the case of overlapping matches.
   */
  readonly prefix: string;
  /** Sequence of guards evaluated sequentially before execution. */
  readonly guards?: readonly ComponentGuard<Params>[];
  /** Optional bot-owned custom metadata attached to this definition. */
  readonly metadata?: Metadata;
  /** Optional custom parser transforming the raw `customId` into structured `params`. */
  parse?(customId: string): Params;
  /** Core execution logic invoked when a matching component interaction arrives. */
  execute(ctx: ComponentContext<ComponentInteraction, Params>): void | Promise<void>;
}

/**
 * Declaration contract for a pattern-based route component handler.
 *
 * @typeParam Pattern - The literal route string with colon-delimited parameters (e.g. `"ticket:view:[id]"`).
 * @typeParam Metadata - Bot-defined custom metadata attached to the component.
 *
 * @public
 */
export interface PatternComponentDefinition<
  Pattern extends string,
  Metadata extends Record<string, unknown> = Record<string, never>,
> {
  /** Route pattern string with colon-delimited variables: e.g. `"button:role:[roleId]"`. */
  readonly pattern: Pattern;
  /** Sequence of guards evaluated before execution. */
  readonly guards?: readonly ComponentGuard<ParamsFromPattern<Pattern>>[];
  /** Optional bot-owned custom metadata. */
  readonly metadata?: Metadata;
  /** Execution logic receiving automatically inferred parameters in `ctx.params`. */
  execute(
    ctx: ComponentContext<ComponentInteraction, ParamsFromPattern<Pattern>>,
  ): void | Promise<void>;
}

/**
 * Identity helper for declaring a prefix-based component handler.
 *
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @typeParam Params - Parsed parameter type.
 * @param definition - The component definition with `prefix`.
 * @returns The validated component definition.
 *
 * @public
 */
export function defineComponent<
  Metadata extends Record<string, unknown> = Record<string, never>,
  Params = undefined,
>(definition: ComponentDefinition<Metadata, Params>): ComponentDefinition<Metadata, Params>;

/**
 * Identity helper for declaring a pattern-based route component handler with typed parameter extraction.
 *
 * @typeParam Pattern - Literal pattern string with colon-delimited tokens.
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @param definition - The component definition with `pattern`.
 * @returns The compiled component definition.
 *
 * @example
 * ```typescript
 * import { defineComponent } from '@sxnnyside/circe';
 *
 * export default defineComponent({
 *   pattern: 'vote:[pollId]:[option]',
 *   execute(ctx) {
 *     const { pollId, option } = ctx.params;
 *     return ctx.interaction.reply(`Voted ${option} on poll ${pollId}`);
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineComponent<
  Pattern extends string,
  Metadata extends Record<string, unknown> = Record<string, never>,
>(
  definition: PatternComponentDefinition<Pattern, Metadata>,
): ComponentDefinition<Metadata, ParamsFromPattern<Pattern>>;

// biome-ignore lint/suspicious/noExplicitAny: implementation signature for the two typed overloads above
export function defineComponent(definition: any): any {
  if ('pattern' in definition) {
    const compiled = compilePattern(definition.pattern);
    return {
      prefix: compiled.prefix,
      parse: compiled.parse,
      ...(definition.guards !== undefined ? { guards: definition.guards } : {}),
      ...(definition.metadata !== undefined ? { metadata: definition.metadata } : {}),
      execute: definition.execute,
    };
  }
  return definition;
}
