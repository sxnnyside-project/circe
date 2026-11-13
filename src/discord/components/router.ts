import { type Client, Events, type Interaction } from 'discord.js';
import type { MiddlewareModule } from '../../application/middleware.js';
import type { LocalizationResolver } from '../../localization/resolver.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import type { InteractionTelemetryHandler } from '../../observability/metrics.js';
import type { ErrorReporter } from '../../observability/report-error.js';
import { createBaseContext, runInteraction } from '../run-interaction.js';
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
  /** Telemetry callback invoked upon interaction completion. */
  onInteractionComplete?: InteractionTelemetryHandler;
}

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
  const start = performance.now();
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ customId: interaction.customId });
    const base = createBaseContext(interaction, options.i18n, logger, correlationId);
    const handler = options.registry.resolve(interaction.customId);

    await runInteraction<ComponentContext, ComponentError>({
      kind: 'component',
      metricKind: 'component',
      name: interaction.customId,
      failureMessage: `Component "${interaction.customId}" failed`,
      errorClass: ComponentError,
      identityKey: 'customId',
      start,
      ctx: { ...base, params: undefined },
      contextFor: () => ({ ...base, params: handler?.parse?.(interaction.customId) }),
      handler,
      middleware: options.middleware,
      onError: options.onError,
      onInteractionComplete: options.onInteractionComplete,
      onUnknown: options.onUnknownComponent ?? defaultOnUnknownComponent,
      onGuardDenied: options.onGuardDenied ?? defaultOnGuardDenied,
      onFailure: options.onComponentError ?? defaultOnComponentError,
    });
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
