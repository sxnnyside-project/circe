import { type Client, Events, GuildMember, type Interaction } from 'discord.js';
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
import { ComponentError } from './errors.js';
import type { ComponentRegistry } from './registry.js';
import type { ComponentContext, ComponentInteraction } from './types.js';

/**
 * Called when a customId doesn't match any registered prefix. The default
 * replies with a plain ephemeral message; override to localize, brand, or
 * route it elsewhere.
 */
export type UnknownComponentHandler = (ctx: ComponentContext) => void | Promise<void>;

/**
 * Called when a component handler throws. `error` is always a
 * `ComponentError` — Circe normalizes and wraps whatever was thrown before
 * calling this. The default logs it and replies with a generic ephemeral
 * message; override for custom user-facing error presentation.
 */
export type ComponentErrorHandler = (
  ctx: ComponentContext,
  error: ComponentError,
) => void | Promise<void>;

/**
 * Called when a component guard denies execution. The default replies
 * with the guard's reason as a plain ephemeral message; override to
 * localize or brand it.
 */
export type ComponentGuardDeniedHandler = (
  ctx: ComponentContext,
  reason: string,
) => void | Promise<void>;

export interface ComponentRouterOptions {
  registry: ComponentRegistry;
  logger: Logger;
  onUnknownComponent?: UnknownComponentHandler;
  onComponentError?: ComponentErrorHandler;
  onGuardDenied?: ComponentGuardDeniedHandler;
  middleware?: MiddlewareModule;
  /** Defaults to a resolver that returns every key verbatim, untranslated. */
  i18n?: LocalizationResolver;
  /** Called for every error this router's boundary catches, decoupled from the user-facing reply — for external reporting (OpenTelemetry, Sentry, metrics). */
  onError?: ErrorReporter;
}

const defaultLocalizationResolver = new IdentityLocalizationResolver();

async function defaultOnUnknownComponent(ctx: ComponentContext): Promise<void> {
  ctx.logger.warn('Received interaction for an unregistered component', {
    customId: ctx.interaction.customId,
  });
  await safeEphemeralReply(ctx.interaction, 'This action is not currently available.');
}

async function defaultOnGuardDenied(ctx: ComponentContext, reason: string): Promise<void> {
  ctx.logger.info('Component blocked by guard', { reason });
  await safeEphemeralReply(ctx.interaction, reason);
}

async function defaultOnComponentError(
  ctx: ComponentContext,
  error: ComponentError,
): Promise<void> {
  ctx.logger.error(error.message, { error, correlationId: error.correlationId });
  await safeEphemeralReply(ctx.interaction, 'Something went wrong while handling that action.');
}

/**
 * Handles a single button/select-menu interaction end to end: resolves the
 * handler by customId prefix, executes it, and funnels any failure through
 * one error boundary — `onUnknownComponent`/`onComponentError`, defaulting
 * to a plain ephemeral reply when the bot doesn't supply its own. Kept
 * separate from `attachComponentRouter` so it can be exercised with a
 * hand-built interaction stub in tests, without a live client.
 */
export async function handleComponentInteraction(
  interaction: ComponentInteraction,
  options: ComponentRouterOptions,
): Promise<void> {
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ customId: interaction.customId });

    const base = {
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
      await (options.onUnknownComponent ?? defaultOnUnknownComponent)({
        ...base,
        params: undefined,
      });
      return;
    }

    // `parse` runs inside the same try/catch as `execute` below — a bad
    // customId is an execution failure like any other, not a separate
    // error path. `ctx` starts with `params: undefined` so the error
    // handler always has a valid context even if `parse` itself throws.
    let ctx: ComponentContext = { ...base, params: undefined };

    try {
      await runWithMiddleware(
        options.middleware,
        () => ({ kind: 'component', name: interaction.customId, logger, correlationId }),
        async () => {
          ctx = { ...base, params: handler.parse?.(interaction.customId) };
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
      const normalized = normalizeError(error, `Component "${interaction.customId}" failed`);
      const componentError =
        normalized instanceof ComponentError
          ? normalized
          : new ComponentError(normalized.message, {
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
        componentError,
        {
          kind: 'component',
          name: interaction.customId,
          correlationId,
          timestamp: new Date().toISOString(),
          guildId: interaction.guildId ?? undefined,
          channelId: interaction.channelId ?? undefined,
          userId: interaction.user.id,
        },
        logger,
      );
      await (options.onComponentError ?? defaultOnComponentError)(ctx, componentError);
    }
  });
}

/** Wires the router onto a live discord.js client's `interactionCreate` event. */
export function attachComponentRouter(client: Client, options: ComponentRouterOptions): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
      return;
    }
    void handleComponentInteraction(interaction, options);
  });
}
