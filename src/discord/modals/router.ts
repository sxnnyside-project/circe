import {
  type Client,
  Events,
  GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { MiddlewareModule } from '../../application/middleware.js';
import { runWithMiddleware } from '../../application/middleware.js';
import { normalizeError } from '../../errors/normalize-error.js';
import {
  createTranslator,
  IdentityLocalizationResolver,
  type LocalizationResolver,
  localizationContextOf,
} from '../../localization/resolver.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import { type ErrorReporter, reportError } from '../../observability/report-error.js';
import type { GuardResult } from '../commands/types.js';
import { safeEphemeralReply } from '../safe-respond.js';
import { ModalError } from './errors.js';
import type { ModalRegistry } from './registry.js';
import type { ModalContext } from './types.js';

/**
 * Called when a customId doesn't match any registered prefix. The default
 * replies with a plain ephemeral message; override to localize, brand, or
 * route it elsewhere.
 */
export type UnknownModalHandler = (ctx: ModalContext) => void | Promise<void>;

/**
 * Called when a modal handler throws. `error` is always a `ModalError` —
 * Circe normalizes and wraps whatever was thrown before calling this. The
 * default logs it and replies with a generic ephemeral message; override
 * for custom user-facing error presentation.
 */
export type ModalErrorHandler = (ctx: ModalContext, error: ModalError) => void | Promise<void>;

/**
 * Called when a modal guard denies execution. The default replies with
 * the guard's reason as a plain ephemeral message; override to localize
 * or brand it.
 */
export type ModalGuardDeniedHandler = (ctx: ModalContext, reason: string) => void | Promise<void>;

export interface ModalRouterOptions {
  registry: ModalRegistry;
  logger: Logger;
  onUnknownModal?: UnknownModalHandler;
  onModalError?: ModalErrorHandler;
  onGuardDenied?: ModalGuardDeniedHandler;
  middleware?: MiddlewareModule;
  /** Defaults to a resolver that returns every key verbatim, untranslated. */
  i18n?: LocalizationResolver;
  /** Called for every error this router's boundary catches, decoupled from the user-facing reply — for external reporting (OpenTelemetry, Sentry, metrics). */
  onError?: ErrorReporter;
}

const defaultLocalizationResolver = new IdentityLocalizationResolver();

async function defaultOnUnknownModal(ctx: ModalContext): Promise<void> {
  ctx.logger.warn('Received submission for an unregistered modal', {
    customId: ctx.interaction.customId,
  });
  await safeEphemeralReply(ctx.interaction, 'This form is not currently available.');
}

async function defaultOnGuardDenied(ctx: ModalContext, reason: string): Promise<void> {
  ctx.logger.info('Modal blocked by guard', { reason });
  await safeEphemeralReply(ctx.interaction, reason);
}

async function defaultOnModalError(ctx: ModalContext, error: ModalError): Promise<void> {
  ctx.logger.error(error.message, { error, correlationId: error.correlationId });
  await safeEphemeralReply(ctx.interaction, 'Something went wrong while handling that submission.');
}

/**
 * Handles a single modal submission end to end: resolves the handler by
 * customId prefix, executes it, and funnels any failure through one error
 * boundary — `onUnknownModal`/`onModalError`, defaulting to a plain
 * ephemeral reply when the bot doesn't supply its own. Kept separate from
 * `attachModalRouter` so it can be exercised with a hand-built interaction
 * stub in tests, without a live client — the same shape as
 * `handleComponentInteraction`.
 */
export async function handleModalInteraction(
  interaction: ModalSubmitInteraction,
  options: ModalRouterOptions,
): Promise<void> {
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ customId: interaction.customId });

    const ctx: ModalContext = {
      interaction,
      client: interaction.client,
      guild: interaction.guild,
      member: interaction.member instanceof GuildMember ? interaction.member : null,
      user: interaction.user,
      logger,
      correlationId,
      t: createTranslator(
        options.i18n ?? defaultLocalizationResolver,
        interaction.locale,
        localizationContextOf(interaction),
      ),
    };

    const handler = options.registry.resolve(interaction.customId);

    if (!handler) {
      await (options.onUnknownModal ?? defaultOnUnknownModal)(ctx);
      return;
    }

    try {
      await runWithMiddleware(
        options.middleware,
        () => ({ kind: 'modal', name: interaction.customId, logger, correlationId }),
        async () => {
          for (const guard of handler.guards ?? []) {
            const result: GuardResult = await guard(ctx);
            if (result !== true) {
              await (options.onGuardDenied ?? defaultOnGuardDenied)(ctx, result);
              return;
            }
          }
          await handler.execute(ctx);
        },
      );
    } catch (error) {
      const normalized = normalizeError(error, `Modal "${interaction.customId}" failed`);
      const modalError =
        normalized instanceof ModalError
          ? normalized
          : new ModalError(normalized.message, {
              cause: normalized,
              operational: normalized.operational,
              metadata: {
                ...normalized.metadata,
                reason: 'execution-failed',
                customId: interaction.customId,
              },
            });
      await reportError(
        options.onError,
        modalError,
        {
          kind: 'modal',
          name: interaction.customId,
          correlationId,
          timestamp: new Date().toISOString(),
          guildId: interaction.guildId ?? undefined,
          channelId: interaction.channelId ?? undefined,
          userId: interaction.user.id,
        },
        logger,
      );
      await (options.onModalError ?? defaultOnModalError)(ctx, modalError);
    }
  });
}

/** Wires the router onto a live discord.js client's `interactionCreate` event. */
export function attachModalRouter(client: Client, options: ModalRouterOptions): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isModalSubmit()) {
      return;
    }
    void handleModalInteraction(interaction, options);
  });
}
