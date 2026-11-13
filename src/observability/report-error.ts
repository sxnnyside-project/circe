import type { CirceError } from '../errors/circe-error.js';
import type { Logger } from '../logging/logger.js';

/**
 * Category of Discord entity where the error occurred.
 * @public
 */
export type ErrorReportKind =
  | 'command'
  | 'autocomplete'
  | 'component'
  | 'modal'
  | 'context-menu'
  | 'event';

/**
 * Contextual metadata passed to an `ErrorReporter`.
 * Aligned with modern OpenTelemetry semantic conventions and APM reporting.
 *
 * @public
 */
export interface ErrorReportContext {
  /** The interaction or entity category. */
  readonly kind: ErrorReportKind;
  /** Command/event name, or component/modal customId identifying the handler. */
  readonly name: string;
  /** Active correlation ID from AsyncLocalStorage, if any. */
  readonly correlationId: string | undefined;
  /** ISO 8601 timestamp when the error was captured. */
  readonly timestamp?: string;
  /** ID of the Discord guild where the interaction occurred, if any. */
  readonly guildId?: string | undefined;
  /** ID of the Discord channel where the interaction occurred, if any. */
  readonly channelId?: string | undefined;
  /** ID of the Discord user who invoked the interaction, if any. */
  readonly userId?: string | undefined;
}

/**
 * Called whenever any router's error boundary — or the event dispatcher —
 * catches a `CirceError`, regardless of category.
 *
 * @remarks
 * Decoupled from user-facing reply hooks (`onCommandError`, `onComponentError`, etc.):
 * those hooks shape the user-facing Discord response; this is purely for external
 * telemetry and observability (OpenTelemetry, Sentry, Datadog, Prometheus),
 * so a bot configures it once instead of duplicating reporting logic across five handlers.
 *
 * A throwing reporter is caught, logged, and isolated — it never breaks the user-facing
 * interaction response it runs alongside.
 *
 * @example
 * ```ts
 * const reporter: ErrorReporter = async (error, context) => {
 *   Sentry.captureException(error, { extra: context });
 * };
 * ```
 *
 * @param error - The caught `CirceError` instance.
 * @param context - Semantic interaction and correlation metadata.
 * @returns Void or promise resolving when telemetry dispatch completes.
 * @public
 */
export type ErrorReporter = (
  error: CirceError,
  context: ErrorReportContext,
) => void | Promise<void>;

/**
 * Invokes `reporter` (if any) with `error`/`context`, isolating any failure
 * from the caller — a reporter that throws (a misconfigured Sentry client,
 * a network error sending a span) is logged and swallowed, never allowed to
 * break the user-facing error handling it runs alongside.
 *
 * @internal
 * @param reporter - Optional error reporter callback.
 * @param error - The `CirceError` to report.
 * @param context - Interaction metadata.
 * @param logger - Logger instance for recording reporter failures.
 * @returns Promise resolving once reported or caught.
 */
export async function reportError(
  reporter: ErrorReporter | undefined,
  error: CirceError,
  context: ErrorReportContext,
  logger: Logger,
): Promise<void> {
  if (!reporter) {
    return;
  }

  try {
    await reporter(error, context);
  } catch (reportingError) {
    logger.error('Error reporter threw while reporting an error', {
      error: reportingError,
      originalError: error,
      context,
    });
  }
}
