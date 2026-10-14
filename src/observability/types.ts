import type { CirceError } from '../errors/circe-error.js';

export type ErrorReportKind = 'command' | 'component' | 'modal' | 'context-menu' | 'event';

export interface ErrorReportContext {
  readonly kind: ErrorReportKind;
  /** Command/event name, or component/modal customId — whichever identifies where the error happened. */
  readonly name: string;
  readonly correlationId: string | undefined;
}

/**
 * Called whenever any router's error boundary — or the event dispatcher —
 * catches a `CirceError`, regardless of category. Decoupled from the
 * `onCommandError`/`onComponentError`/etc. hooks: those shape the
 * *user-facing reply*; this is purely for external reporting (OpenTelemetry,
 * Sentry, a metrics counter), so a bot wires it once instead of duplicating
 * the same reporting call inside every one of those five reply-shaping
 * handlers. A throwing reporter is caught and logged — it never breaks the
 * user-facing error handling it runs alongside.
 */
export type ErrorReporter = (
  error: CirceError,
  context: ErrorReportContext,
) => void | Promise<void>;
