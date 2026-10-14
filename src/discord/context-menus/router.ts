import { type Client, Events, GuildMember, type Interaction } from 'discord.js';
import type { MiddlewareModule } from '../../application/middleware.js';
import { runWithMiddleware } from '../../application/middleware.js';
import { normalizeError } from '../../errors/normalize-error.js';
import { IdentityI18nResolver } from '../../i18n/identity-resolver.js';
import { createTranslator, i18nContextOf } from '../../i18n/translator.js';
import type { I18nResolver } from '../../i18n/types.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import { reportError } from '../../observability/report-error.js';
import type { ErrorReporter } from '../../observability/types.js';
import type { GuardResult } from '../commands/types.js';
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
  i18n?: I18nResolver;
  /** Called for every error this router's boundary catches, decoupled from the user-facing reply — for external reporting (OpenTelemetry, Sentry, metrics). */
  onError?: ErrorReporter;
}

const defaultI18nResolver = new IdentityI18nResolver();

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

/** Wires the router onto a live discord.js client's `interactionCreate` event, for both user and message context menu commands. */
export function attachContextMenuRouter(
  client: Client,
  options: ContextMenuCommandRouterOptions,
): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (
      typeof interaction.isUserContextMenuCommand === 'function' &&
      interaction.isUserContextMenuCommand()
    ) {
      void withCorrelationId(async () => {
        const correlationId = getCorrelationId();
        const logger = options.logger.child({ command: interaction.commandName, target: 'user' });
        const ctx: UserContextMenuCommandContext = {
          interaction,
          client: interaction.client,
          guild: interaction.guild,
          member: interaction.member instanceof GuildMember ? interaction.member : null,
          target:
            interaction.targetMember instanceof GuildMember
              ? interaction.targetMember
              : interaction.targetUser,
          user: interaction.user,
          logger,
          correlationId,
          t: createTranslator(
            options.i18n ?? defaultI18nResolver,
            interaction.locale,
            i18nContextOf(interaction),
          ),
        };

        const command = options.registry.getUser(interaction.commandName);
        if (!command) {
          await (options.onUnknownContextMenuCommand ?? defaultOnUnknown)(ctx);
          return;
        }

        await runCommand(ctx, command.guards, () => command.execute(ctx), options);
      });
      return;
    }

    if (
      typeof interaction.isMessageContextMenuCommand === 'function' &&
      interaction.isMessageContextMenuCommand()
    ) {
      void withCorrelationId(async () => {
        const correlationId = getCorrelationId();
        const logger = options.logger.child({
          command: interaction.commandName,
          target: 'message',
        });
        const ctx: MessageContextMenuCommandContext = {
          interaction,
          client: interaction.client,
          guild: interaction.guild,
          member: interaction.member instanceof GuildMember ? interaction.member : null,
          target: interaction.targetMessage,
          user: interaction.user,
          logger,
          correlationId,
          t: createTranslator(
            options.i18n ?? defaultI18nResolver,
            interaction.locale,
            i18nContextOf(interaction),
          ),
        };

        const command = options.registry.getMessage(interaction.commandName);
        if (!command) {
          await (options.onUnknownContextMenuCommand ?? defaultOnUnknown)(ctx);
          return;
        }

        await runCommand(ctx, command.guards, () => command.execute(ctx), options);
      });
    }
  });
}

async function runCommand<
  Ctx extends UserContextMenuCommandContext | MessageContextMenuCommandContext,
>(
  ctx: Ctx,
  guards: ReadonlyArray<(ctx: Ctx) => GuardResult | Promise<GuardResult>> | undefined,
  execute: () => void | Promise<void>,
  options: ContextMenuCommandRouterOptions,
): Promise<void> {
  try {
    await runWithMiddleware(
      options.middleware,
      () => ({
        kind: 'context-menu',
        name: ctx.interaction.commandName,
        logger: ctx.logger,
        correlationId: ctx.correlationId,
      }),
      async () => {
        for (const guard of guards ?? []) {
          const result = await guard(ctx);
          if (result !== true) {
            await (options.onGuardDenied ?? defaultOnGuardDenied)(ctx, result);
            return;
          }
        }
        await execute();
      },
    );
  } catch (error) {
    const normalized = normalizeError(
      error,
      `Context menu command "${ctx.interaction.commandName}" failed`,
    );
    const commandError =
      normalized instanceof ContextMenuCommandError
        ? normalized
        : new ContextMenuCommandError(normalized.message, {
            cause: normalized,
            operational: normalized.operational,
            metadata: {
              ...normalized.metadata,
              reason: 'execution-failed',
              command: ctx.interaction.commandName,
            },
          });
    await reportError(
      options.onError,
      commandError,
      { kind: 'context-menu', name: ctx.interaction.commandName, correlationId: ctx.correlationId },
      ctx.logger,
    );
    await (options.onContextMenuCommandError ?? defaultOnError)(ctx, commandError);
  }
}
