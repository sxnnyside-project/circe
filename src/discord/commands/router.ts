import {
  type ChatInputCommandInteraction,
  type Client,
  Events,
  type Interaction,
} from 'discord.js';
import type { MiddlewareModule } from '../../application/middleware.js';
import type { LocalizationResolver } from '../../localization/resolver.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import type { InteractionTelemetryHandler } from '../../observability/metrics.js';
import type { ErrorReporter } from '../../observability/report-error.js';
import { createBaseContext, runInteraction } from '../run-interaction.js';
import { safeEphemeralReply } from '../safe-respond.js';
import { CommandError } from './errors.js';
import type { CommandRegistry } from './registry.js';
import type { CommandContext } from './types.js';

/**
 * Called when an interaction names a command that isn't in the registry.
 *
 * @remarks
 * The default replies with a plain ephemeral message; override to localize
 * it, brand it, or route it elsewhere.
 *
 * @param ctx - The command interaction context.
 *
 * @public
 */
export type UnknownCommandHandler = (ctx: CommandContext) => void | Promise<void>;

/**
 * Called when a guard denies execution.
 *
 * @remarks
 * `reason` is whatever string the guard returned. The default replies with that
 * reason as plain ephemeral text; override to control the reply's content and presentation.
 *
 * @param ctx - The command interaction context.
 * @param reason - The descriptive denial reason returned by the failing guard.
 *
 * @public
 */
export type GuardDeniedHandler = (ctx: CommandContext, reason: string) => void | Promise<void>;

/**
 * Called when a guard or `execute()` throws an unhandled error.
 *
 * @remarks
 * `error` is always normalized into a {@link CommandError}. The default logs the error
 * and replies with a generic ephemeral message.
 *
 * @param ctx - The command interaction context.
 * @param error - The normalized command error.
 *
 * @public
 */
export type CommandErrorHandler = (
  ctx: CommandContext,
  error: CommandError,
) => void | Promise<void>;

/**
 * Configuration options for command routing and interaction handling.
 *
 * @public
 */
export interface CommandRouterOptions {
  /** The registry containing registered command definitions. */
  registry: CommandRegistry;
  /** Component logger for command routing diagnostics. */
  logger: Logger;
  /** Custom handler invoked when an unregistered command name is received. */
  onUnknownCommand?: UnknownCommandHandler;
  /** Custom handler invoked when a guard denies execution. */
  onGuardDenied?: GuardDeniedHandler;
  /** Custom handler invoked when an execution error occurs. */
  onCommandError?: CommandErrorHandler;
  /** Global or scoped interaction middleware hooks. */
  middleware?: MiddlewareModule;
  /**
   * Localization resolver for `ctx.t(key, params)`.
   * @defaultValue Identity resolver returning keys untranslated.
   */
  i18n?: LocalizationResolver;
  /** Central observability callback for logging and telemetry platforms. */
  onError?: ErrorReporter;
  /** Telemetry callback invoked upon interaction completion. */
  onInteractionComplete?: InteractionTelemetryHandler;
}

async function defaultOnUnknownCommand(ctx: CommandContext): Promise<void> {
  ctx.logger.warn('Received interaction for an unregistered command', {
    command: ctx.interaction.commandName,
  });
  await safeEphemeralReply(ctx.interaction, 'This command is not currently available.');
}

async function defaultOnGuardDenied(ctx: CommandContext, reason: string): Promise<void> {
  ctx.logger.info('Command blocked by guard', { reason });
  await safeEphemeralReply(ctx.interaction, reason);
}

async function defaultOnCommandError(ctx: CommandContext, error: CommandError): Promise<void> {
  ctx.logger.error(error.message, { error, correlationId: error.correlationId });
  await safeEphemeralReply(ctx.interaction, 'Something went wrong while running that command.');
}

/**
 * Handles a single chat-input command interaction end to end: resolves the
 * command, runs its guards, executes it, and funnels any failure through
 * one error boundary — `onUnknownCommand`/`onGuardDenied`/`onCommandError`.
 *
 * @param interaction - The raw discord.js chat input command interaction.
 * @param options - Routing options and handlers.
 *
 * @public
 */
export async function handleCommandInteraction(
  interaction: ChatInputCommandInteraction,
  options: CommandRouterOptions,
): Promise<void> {
  const start = performance.now();
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ command: interaction.commandName });
    const ctx: CommandContext = createBaseContext(interaction, options.i18n, logger, correlationId);

    await runInteraction({
      kind: 'command',
      metricKind: 'command',
      name: interaction.commandName,
      failureMessage: `Command "${interaction.commandName}" failed`,
      errorClass: CommandError,
      identityKey: 'command',
      start,
      ctx,
      handler: options.registry.get(interaction.commandName),
      middleware: options.middleware,
      onError: options.onError,
      onInteractionComplete: options.onInteractionComplete,
      onUnknown: options.onUnknownCommand ?? defaultOnUnknownCommand,
      onGuardDenied: options.onGuardDenied ?? defaultOnGuardDenied,
      onFailure: options.onCommandError ?? defaultOnCommandError,
    });
  });
}

/**
 * Wires the command router onto a live discord.js client's `interactionCreate` event.
 *
 * @param client - The discord.js client instance.
 * @param options - Routing options and handlers.
 *
 * @public
 */
export function attachCommandRouter(client: Client, options: CommandRouterOptions): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    void handleCommandInteraction(interaction, options);
  });
}
