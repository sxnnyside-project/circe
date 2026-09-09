import type { CommandContext } from "../discord/commands/types.js";
import { IdentityI18nResolver } from "../i18n/identity-resolver.js";
import { createTranslator } from "../i18n/translator.js";
import type { I18nResolver } from "../i18n/types.js";
import { createTestInteraction, type TestInteractionOptions } from "./interaction.js";
import { createTestLogger } from "./logger.js";

export interface TestContextOptions extends TestInteractionOptions {
  correlationId?: string;
  /** Defaults to a resolver that returns every key verbatim, untranslated — same default as the real router. */
  i18n?: I18nResolver;
}

const defaultI18nResolver = new IdentityI18nResolver();

/**
 * Builds a `CommandContext` directly, for testing a command's `execute()`
 * (or a guard) without going through the router at all — the fastest path
 * when a test only cares about the command's own logic, not routing,
 * guard-denial replies, or the error boundary. Use `testCommand` instead
 * when the router's behavior (guards, error handling, reply routing) is
 * itself part of what's being tested.
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
    t: createTranslator(options.i18n ?? defaultI18nResolver, interaction.locale),
  };
}
