import type { MiddlewareModule } from '../application/middleware.js';
import type { CommandError } from '../discord/commands/errors.js';
import { CommandRegistry } from '../discord/commands/registry.js';
import { type CommandRouterOptions, handleCommandInteraction } from '../discord/commands/router.js';
import type { CommandContext, CommandDefinition } from '../discord/commands/types.js';
import type { LocalizationResolver } from '../localization/resolver.js';
import type { InteractionTelemetryHandler } from '../observability/metrics.js';
import type { ErrorReporter } from '../observability/report-error.js';
import { createTestInteraction, type TestInteractionOptions } from './interaction.js';
import { createTestLogger } from './logger.js';
import { createTestExecutionResult, type TestExecutionResult } from './result.js';

/**
 * Configuration options for executing a command under test.
 *
 * @remarks
 * Combines interaction simulation options with optional router behaviors:
 * middleware chains, custom localization resolvers, guard denial hooks, error reporters,
 * and telemetry handlers.
 *
 * @public
 */
export interface TestCommandOptions extends TestInteractionOptions {
  /** Custom localization resolver. */
  readonly i18n?: LocalizationResolver;
  /** Middleware module executed prior to guards and command handler. */
  readonly middleware?: MiddlewareModule;
  /** Central error reporting callback. */
  readonly onError?: ErrorReporter;
  /** Custom callback invoked when a guard denies execution. */
  readonly onGuardDenied?: (ctx: CommandContext, reason: string) => void | Promise<void>;
  /** Custom callback invoked when command execution throws an unhandled error. */
  readonly onCommandError?: (ctx: CommandContext, error: CommandError) => void | Promise<void>;
  /** Observability callback invoked upon interaction completion. */
  readonly onInteractionComplete?: InteractionTelemetryHandler;
}

/**
 * Result of executing a command under test, providing replies, logs, modals, and assertion helpers.
 *
 * @public
 */
export type TestCommandResult = TestExecutionResult;

/**
 * Runs a command through Circe's real routing path — guard evaluation, middleware,
 * `execute()`, and the central error boundary — exactly as `attachCommandRouter` would.
 *
 * @remarks
 * Exercises the actual production `handleCommandInteraction` logic against a fabricated
 * interaction, enabling realistic integration testing of slash commands and subcommand trees.
 *
 * @param command - The command definition under test.
 * @param options - Custom options for the fabricated interaction and router pipeline.
 * @returns A promise resolving to an ergonomic {@link TestCommandResult}.
 *
 * @example
 * ```typescript
 * import { testCommand } from '@sxnnyside/circe/testing';
 * import pingCommand from './commands/ping.js';
 *
 * const result = await testCommand(pingCommand, {
 *   options: { verbose: true },
 * });
 * expect(result.hasReply('Pong!')).toBe(true);
 * ```
 *
 * @public
 */
export async function testCommand(
  command: CommandDefinition,
  options: TestCommandOptions = {},
): Promise<TestCommandResult> {
  const registry = new CommandRegistry();
  registry.register(command);

  const { logger, entries } = createTestLogger();
  const { interaction, replies, followUps, modals } = createTestInteraction({
    commandName: command.builder.name,
    ...options,
  });

  const routerOptions: CommandRouterOptions = {
    registry,
    logger,
    ...(options.i18n !== undefined && { i18n: options.i18n }),
    ...(options.middleware !== undefined && { middleware: options.middleware }),
    ...(options.onError !== undefined && { onError: options.onError }),
    ...(options.onGuardDenied !== undefined && { onGuardDenied: options.onGuardDenied }),
    ...(options.onCommandError !== undefined && { onCommandError: options.onCommandError }),
    ...(options.onInteractionComplete !== undefined && {
      onInteractionComplete: options.onInteractionComplete,
    }),
  };

  await handleCommandInteraction(interaction, routerOptions);

  return createTestExecutionResult({
    replies,
    followUps,
    logs: entries,
    modals,
    isDeferred: interaction.deferred,
    isReplied: interaction.replied,
  });
}
