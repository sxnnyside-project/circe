import type { CommandContext } from "../discord/commands/types.js";
import { createTestInteraction, type TestInteractionOptions } from "./interaction.js";
import { createTestLogger } from "./logger.js";

export interface TestContextOptions extends TestInteractionOptions {
  correlationId?: string;
}

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
  };
}
