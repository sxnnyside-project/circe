import {
  type Client,
  Events,
  GuildMember,
  type Interaction,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from 'discord.js';
import type { MiddlewareModule } from '../../application/middleware.js';
import type { LocalizationResolver } from '../../localization/resolver.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import type { InteractionTelemetryHandler } from '../../observability/metrics.js';
import type { ErrorReporter } from '../../observability/report-error.js';
import { createBaseContext, runInteraction } from '../run-interaction.js';
import { safeEphemeralReply } from '../safe-respond.js';
import { ContextMenuCommandError } from './errors.js';
import type { ContextMenuCommandRegistry } from './registry.js';
import type { MessageContextMenuCommandContext, UserContextMenuCommandContext } from './types.js';

export type UnknownContextMenuCommandHandler = (
  ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
) => void | Promise<void>;

export type ContextMenuGuardDeniedHandler = (
  ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
  reason: string,
) => void | Promise<void>;

export type ContextMenuCommandErrorHandler = (
  ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
  error: ContextMenuCommandError,
) => void | Promise<void>;

export interface ContextMenuCommandRouterOptions {
  registry: ContextMenuCommandRegistry;
  logger: Logger;
  onUnknownContextMenuCommand?: UnknownContextMenuCommandHandler;
  onGuardDenied?: ContextMenuGuardDeniedHandler;
  onContextMenuCommandError?: ContextMenuCommandErrorHandler;
  middleware?: MiddlewareModule;
  /** Defaults to a resolver that returns every key verbatim, untranslated. */
  i18n?: LocalizationResolver;
  /** Called for every error this router's boundary catches, decoupled from the user-facing reply — for external reporting (OpenTelemetry, Sentry, metrics). */
  onError?: ErrorReporter;
  /** Telemetry callback invoked upon interaction completion. */
  onInteractionComplete?: InteractionTelemetryHandler;
}

async function defaultOnUnknown(
  ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
): Promise<void> {
  ctx.logger.warn('Received interaction for an unregistered context menu command', {
    command: ctx.interaction.commandName,
  });
  await safeEphemeralReply(ctx.interaction, 'This action is not currently available.');
}

async function defaultOnGuardDenied(
  ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
  reason: string,
): Promise<void> {
  ctx.logger.info('Context menu command blocked by guard', { reason });
  await safeEphemeralReply(ctx.interaction, reason);
}

async function defaultOnError(
  ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
  error: ContextMenuCommandError,
): Promise<void> {
  ctx.logger.error(error.message, { error, correlationId: error.correlationId });
  await safeEphemeralReply(ctx.interaction, 'Something went wrong while running that action.');
}

/**
 * Handles a single user or message context menu interaction.
 *
 * @remarks
 * Kept separate from `attachContextMenuRouter` so it can be exercised with a
 * hand-built interaction stub in tests, without a live client or gateway connection.
 *
 * @param interaction - The incoming context menu interaction.
 * @param options - Router configuration and registries.
 *
 * @public
 */
export async function handleContextMenuInteraction(
  interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction,
  options: ContextMenuCommandRouterOptions,
): Promise<void> {
  const start = performance.now();
  const isUser =
    typeof interaction.isUserContextMenuCommand === 'function' &&
    interaction.isUserContextMenuCommand();
  const isMessage =
    typeof interaction.isMessageContextMenuCommand === 'function' &&
    interaction.isMessageContextMenuCommand();
  if (!isUser && !isMessage) {
    return;
  }

  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({
      command: interaction.commandName,
      target: isUser ? 'user' : 'message',
    });
    const base = createBaseContext(interaction, options.i18n, logger, correlationId);
    const shared = {
      kind: 'context-menu',
      name: interaction.commandName,
      failureMessage: `Context menu command "${interaction.commandName}" failed`,
      errorClass: ContextMenuCommandError,
      identityKey: 'command',
      start,
      middleware: options.middleware,
      onError: options.onError,
      onInteractionComplete: options.onInteractionComplete,
      onUnknown: options.onUnknownContextMenuCommand ?? defaultOnUnknown,
      onGuardDenied: options.onGuardDenied ?? defaultOnGuardDenied,
      onFailure: options.onContextMenuCommandError ?? defaultOnError,
    } as const;

    if (isUser) {
      const user = interaction as UserContextMenuCommandInteraction;
      await runInteraction({
        ...shared,
        metricKind: 'user-context-menu',
        ctx: {
          ...base,
          target: user.targetMember instanceof GuildMember ? user.targetMember : user.targetUser,
        } as UserContextMenuCommandContext,
        handler: options.registry.getUser(interaction.commandName),
      });
    } else {
      await runInteraction({
        ...shared,
        metricKind: 'message-context-menu',
        ctx: {
          ...base,
          target: (interaction as MessageContextMenuCommandInteraction).targetMessage,
        } as MessageContextMenuCommandContext,
        handler: options.registry.getMessage(interaction.commandName),
      });
    }
  });
}

/** Wires the router onto a live discord.js client's `interactionCreate` event, for both user and message context menu commands. */
export function attachContextMenuRouter(
  client: Client,
  options: ContextMenuCommandRouterOptions,
): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (
      (typeof interaction.isUserContextMenuCommand === 'function' &&
        interaction.isUserContextMenuCommand()) ||
      (typeof interaction.isMessageContextMenuCommand === 'function' &&
        interaction.isMessageContextMenuCommand())
    ) {
      void handleContextMenuInteraction(
        interaction as UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction,
        options,
      );
    }
  });
}
