import { CommandRegistry } from "../discord/commands/registry.js";
import { handleCommandInteraction } from "../discord/commands/router.js";
import type { CommandDefinition } from "../discord/commands/types.js";
import type { LogEntry } from "../logging/logger.js";
import { createTestInteraction, type TestInteractionOptions, type TestReply } from "./interaction.js";
import { createTestLogger } from "./logger.js";

export interface TestCommandResult {
  replies: TestReply[];
  followUps: TestReply[];
  logs: LogEntry[];
}

/**
 * Runs a command through Circe's real routing path — guard evaluation,
 * `execute()`, and the central error boundary — exactly as
 * `attachCommandRouter` would, against a fabricated interaction instead of
 * a live one. This exercises the actual `handleCommandInteraction` code
 * Circe ships, not a reimplementation of it, so a passing test here means
 * the command behaves correctly under the real router.
 */
export async function testCommand(
  command: CommandDefinition,
  options: TestInteractionOptions = {},
): Promise<TestCommandResult> {
  const registry = new CommandRegistry();
  registry.register(command);

  const { logger, entries } = createTestLogger();
  const { interaction, replies, followUps } = createTestInteraction({
    commandName: command.builder.name,
    ...options,
  });

  await handleCommandInteraction(interaction, { registry, logger });

  return { replies, followUps, logs: entries };
}
