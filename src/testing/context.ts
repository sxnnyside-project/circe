import type { CommandContext } from '../discord/commands/types.js';
import {
  createTranslator,
  IdentityLocalizationResolver,
  type LocalizationResolver,
  localizationContextOf,
} from '../localization/resolver.js';
import { createTestInteraction, type TestInteractionOptions } from './interaction.js';
import { createTestLogger } from './logger.js';

/**
 * Options for configuring direct {@link CommandContext} creation.
 *
 * @public
 */
export interface TestContextOptions extends TestInteractionOptions {
  /** Optional correlation ID attached to the context. */
  readonly correlationId?: string;
  /** Custom localization resolver. Defaults to identity resolver. */
  readonly i18n?: LocalizationResolver;
}

const defaultLocalizationResolver = new IdentityLocalizationResolver();

/**
 * Builds a {@link CommandContext} directly for testing a command's `execute()` or guard
 * without passing through the full router lifecycle.
 *
 * @remarks
 * Useful when testing isolated business logic without evaluating router middleware,
 * guard-denial replies, or central error boundaries. Use {@link testCommand} instead when
 * router behaviors (guards, error handling, reply routing) are under test.
 *
 * @param options - Configuration options for interaction and context properties.
 * @returns A fully constructed {@link CommandContext}.
 *
 * @example
 * ```typescript
 * import { createTestContext } from '@sxnnyside/circe/testing';
 *
 * const ctx = createTestContext({
 *   options: { target: '123' },
 *   correlationId: 'req-abc',
 * });
 * await myCommand.execute(ctx);
 * ```
 *
 * @public
 */
export function createTestContext(options: TestContextOptions = {}): CommandContext {
  const { interaction } = createTestInteraction(options);
  const { logger } = createTestLogger();

  return {
    interaction,
    client: interaction.client,
    guild: interaction.guild,
    member: options.member ?? null,
    user: interaction.user,
    logger,
    correlationId: options.correlationId,
    t: createTranslator(
      options.i18n ?? defaultLocalizationResolver,
      interaction.locale,
      localizationContextOf(interaction),
    ),
  };
}
