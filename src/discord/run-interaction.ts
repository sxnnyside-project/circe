import { type BaseInteraction, GuildMember } from 'discord.js';
import {
  type MiddlewareKind,
  type MiddlewareModule,
  runWithMiddleware,
} from '../application/middleware.js';
import type { CirceError, CirceErrorOptions } from '../errors/circe-error.js';
import { normalizeError } from '../errors/normalize-error.js';
import {
  createTranslator,
  IdentityLocalizationResolver,
  type LocalizationResolver,
  localizationContextOf,
} from '../localization/resolver.js';
import type { Logger } from '../logging/logger.js';
import {
  emitInteractionMetric,
  type InteractionMetricKind,
  type InteractionMetricStatus,
  type InteractionTelemetryHandler,
} from '../observability/metrics.js';
import { type ErrorReporter, reportError } from '../observability/report-error.js';
import type { GuardResult } from './commands/types.js';

const defaultLocalizationResolver = new IdentityLocalizationResolver();

/**
 * Builds the fields every interaction context shares, so the four routers cannot drift apart.
 *
 * @param interaction - The raw discord.js interaction.
 * @param i18n - Localization resolver behind `ctx.t`; the identity resolver when omitted.
 * @param logger - Logger already scoped to this interaction.
 * @param correlationId - Correlation ID of the current async scope.
 * @returns The shared slice of the command, component, modal and context-menu contexts.
 *
 * @internal
 */
export function createBaseContext<Interaction extends BaseInteraction>(
  interaction: Interaction,
  i18n: LocalizationResolver | undefined,
  logger: Logger,
  correlationId: string | undefined,
) {
  return {
    interaction,
    client: interaction.client,
    guild: interaction.guild,
    member: interaction.member instanceof GuildMember ? interaction.member : null,
    user: interaction.user,
    logger,
    correlationId,
    t: createTranslator(
      i18n ?? defaultLocalizationResolver,
      interaction.locale,
      localizationContextOf(interaction),
    ),
  };
}

/** What the pipeline reads from any router's context. */
interface PipelineContext {
  readonly interaction: {
    readonly guildId: string | null;
    readonly channelId: string | null;
    readonly user?: { readonly id: string } | undefined;
  };
  readonly logger: Logger;
  readonly correlationId: string | undefined;
}

/**
 * The part of a registered module the pipeline runs: its guards, then `execute`.
 *
 * @internal
 */
export interface PipelineHandler<Ctx> {
  readonly guards?: ReadonlyArray<(ctx: Ctx) => GuardResult | Promise<GuardResult>> | undefined;
  execute(ctx: Ctx): unknown;
}

/**
 * Everything one interaction needs to go through resolve → middleware → guards → execute,
 * with the same telemetry, error reporting and failure isolation for every interaction kind.
 *
 * @internal
 */
export interface InteractionPipeline<Ctx extends PipelineContext, Err extends CirceError> {
  /** Middleware and error-report category. */
  readonly kind: MiddlewareKind;
  /** Telemetry category; finer than `kind` for user and message context menus. */
  readonly metricKind: InteractionMetricKind;
  /** Command name or customId. */
  readonly name: string;
  /** Message used when a thrown value is not already a Circe error. */
  readonly failureMessage: string;
  /** Concrete error class the failure is wrapped in. */
  readonly errorClass: new (
    message: string,
    options?: CirceErrorOptions,
  ) => Err;
  /** Metadata key under which `name` is recorded on the wrapped error. */
  readonly identityKey: 'command' | 'customId';
  /** `performance.now()` when the interaction arrived. */
  readonly start: number;
  readonly ctx: Ctx;
  /** Rebuilds the context inside the middleware window, for data that must be parsed after `before`. */
  readonly contextFor?: (() => Ctx) | undefined;
  /** The matching registered module, or `undefined` when none is registered. */
  readonly handler: PipelineHandler<Ctx> | undefined;
  readonly middleware: MiddlewareModule | undefined;
  readonly onError: ErrorReporter | undefined;
  readonly onInteractionComplete: InteractionTelemetryHandler | undefined;
  readonly onUnknown: (ctx: Ctx) => void | Promise<void>;
  readonly onGuardDenied: (ctx: Ctx, reason: string) => void | Promise<void>;
  readonly onFailure: (ctx: Ctx, error: Err) => void | Promise<void>;
}

/**
 * Runs a bot-supplied reply handler without letting its own failure escape.
 *
 * @remarks
 * The routers launch interactions with `void`, so an exception from here would become an
 * unhandled rejection, which by default shuts the whole bot down.
 */
async function runReplyHandler(logger: Logger, label: string, run: () => unknown): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.error(`${label} handler threw`, { error });
  }
}

/**
 * Runs one interaction through the shared pipeline.
 *
 * @param pipeline - The interaction, its resolved module and the router's handlers.
 *
 * @internal
 */
export async function runInteraction<Ctx extends PipelineContext, Err extends CirceError>(
  pipeline: InteractionPipeline<Ctx, Err>,
): Promise<void> {
  let ctx = pipeline.ctx;
  const { interaction, logger, correlationId } = ctx;

  const emit = (status: InteractionMetricStatus, error?: Err): Promise<void> =>
    emitInteractionMetric(
      pipeline.onInteractionComplete,
      {
        kind: pipeline.metricKind,
        name: pipeline.name,
        status,
        durationMs: Math.max(0, performance.now() - pipeline.start),
        correlationId,
        guildId: interaction.guildId ?? null,
        userId: interaction.user?.id ?? 'unknown',
        ...(error !== undefined ? { error } : {}),
      },
      logger,
    );

  const { handler } = pipeline;
  if (!handler) {
    await runReplyHandler(logger, 'Unknown-interaction', () => pipeline.onUnknown(ctx));
    await emit('unknown');
    return;
  }

  try {
    await runWithMiddleware(
      pipeline.middleware,
      () => ({ kind: pipeline.kind, name: pipeline.name, logger, correlationId }),
      async () => {
        ctx = pipeline.contextFor?.() ?? ctx;
        for (const guard of handler.guards ?? []) {
          const result = await guard(ctx);
          if (result !== true) {
            await pipeline.onGuardDenied(ctx, result);
            await emit('denied');
            return;
          }
        }
        await handler.execute(ctx);
        await emit('success');
      },
    );
  } catch (error) {
    const normalized = normalizeError(error, pipeline.failureMessage);
    const wrapped =
      normalized instanceof pipeline.errorClass
        ? normalized
        : new pipeline.errorClass(normalized.message, {
            cause: normalized,
            operational: normalized.operational,
            metadata: {
              ...normalized.metadata,
              reason: 'execution-failed',
              [pipeline.identityKey]: pipeline.name,
            },
          });
    await reportError(
      pipeline.onError,
      wrapped,
      {
        kind: pipeline.kind,
        name: pipeline.name,
        correlationId,
        timestamp: new Date().toISOString(),
        guildId: interaction.guildId ?? undefined,
        channelId: interaction.channelId ?? undefined,
        userId: interaction.user?.id ?? 'unknown',
      },
      logger,
    );
    await runReplyHandler(logger, 'Error', () => pipeline.onFailure(ctx, wrapped));
    await emit('error', wrapped);
  }
}
