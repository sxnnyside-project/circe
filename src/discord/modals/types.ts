import type { Client, Guild, GuildMember, ModalSubmitInteraction, User } from 'discord.js';
import type { Translator } from '../../localization/resolver.js';
import type { Logger } from '../../logging/logger.js';
import type { GuardResult } from '../commands/types.js';

/**
 * Execution context provided to modal submission handlers.
 *
 * @public
 */
export interface ModalContext {
  /** The raw discord.js modal submission interaction instance. */
  readonly interaction: ModalSubmitInteraction;
  /** The active discord.js client instance. */
  readonly client: Client;
  /** The Discord guild where the modal was submitted, or `null` if in DMs. */
  readonly guild: Guild | null;
  /** The invoking guild member, or `null` if in DMs or uncached. */
  readonly member: GuildMember | null;
  /** The Discord user who submitted the modal. */
  readonly user: User;
  /** Context-scoped logger carrying modal metadata and correlation ID. */
  readonly logger: Logger;
  /** Unique UUID v4 correlation ID tracing this submission. */
  readonly correlationId: string | undefined;
  /** Translates strings for the interaction's locale. */
  readonly t: Translator;
}

/**
 * A composable precondition evaluated before a modal submission handler executes.
 *
 * @param ctx - The modal execution context.
 * @returns `true` to allow execution, or a descriptive string explaining denial.
 *
 * @public
 */
export type ModalGuard = (ctx: ModalContext) => GuardResult | Promise<GuardResult>;

/**
 * Declaration contract for a modal submission handler module.
 *
 * @typeParam Metadata - Bot-defined custom metadata attached to the modal handler.
 *
 * @public
 */
export interface ModalDefinition<Metadata extends Record<string, unknown> = Record<string, never>> {
  /**
   * Matches any modal submission whose `customId` starts with this prefix.
   * Longest prefix wins in the case of overlapping prefixes.
   */
  readonly prefix: string;
  /** Optional sequence of guards evaluated before execution. */
  readonly guards?: readonly ModalGuard[];
  /** Optional bot-owned custom metadata attached to this definition. */
  readonly metadata?: Metadata;
  /** Core execution logic invoked upon receiving a matching modal submission. */
  execute(ctx: ModalContext): void | Promise<void>;
}

/**
 * Identity helper for declaring a modal submission handler with strict inference.
 *
 * @typeParam Metadata - Bot-defined custom metadata shape.
 * @param definition - The modal specification.
 * @returns The validated modal definition.
 *
 * @example
 * ```typescript
 * import { defineModal } from '@sxnnyside/circe';
 *
 * export default defineModal({
 *   prefix: 'feedback:submit',
 *   execute(ctx) {
 *     const feedback = ctx.interaction.fields.getTextInputValue('feedback_text');
 *     return ctx.interaction.reply({ content: 'Thanks for the feedback!', flags: MessageFlags.Ephemeral });
 *   },
 * });
 * ```
 *
 * @public
 */
export function defineModal<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: ModalDefinition<Metadata>,
): ModalDefinition<Metadata> {
  return definition;
}
