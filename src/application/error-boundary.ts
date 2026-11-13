import type {
  CommandErrorHandler,
  GuardDeniedHandler,
  UnknownCommandHandler,
} from '../discord/commands/router.js';
import type {
  ComponentErrorHandler,
  ComponentGuardDeniedHandler,
  UnknownComponentHandler,
} from '../discord/components/router.js';
import type {
  ContextMenuCommandErrorHandler,
  ContextMenuGuardDeniedHandler,
  UnknownContextMenuCommandHandler,
} from '../discord/context-menus/router.js';
import type {
  ModalErrorHandler,
  ModalGuardDeniedHandler,
  UnknownModalHandler,
} from '../discord/modals/router.js';
import type { ErrorReporter } from '../observability/report-error.js';

/**
 * A bot's `error.ts` module — error boundaries and reply-shaping hooks discovered
 * by convention under `scanRoot` (default: `./src/error.ts`).
 *
 * @remarks
 * Every field is optional; an absent reply hook falls back to the router's own
 * default ephemeral reply.
 *
 * Includes `onError`: the central telemetry hook for external observability
 * platforms (Sentry, Datadog, OpenTelemetry, Prometheus, Black Pillar).
 *
 * @example
 * ```typescript
 * import { defineErrorBoundary } from '@sxnnyside/circe';
 *
 * export default defineErrorBoundary({
 *   onCommandError(error, ctx) {
 *     return ctx.reply({ content: `⚠️ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
 *   },
 *   onError(error, ctx) {
 *     sentry.captureException(error, { extra: ctx });
 *   },
 * });
 * ```
 *
 * @public
 */
export interface ErrorBoundaryModule {
  /**
   * Reply hook called when an incoming chat command is not found in the registry.
   */
  onUnknownCommand?: UnknownCommandHandler;

  /**
   * Reply hook called when a command guard denies execution.
   */
  onGuardDenied?: GuardDeniedHandler;

  /**
   * Reply hook called when a command execution throws an unhandled error.
   */
  onCommandError?: CommandErrorHandler;

  /**
   * Reply hook called when a component customId does not match any registered handler.
   */
  onUnknownComponent?: UnknownComponentHandler;

  /**
   * Reply hook called when a component handler throws an unhandled error.
   */
  onComponentError?: ComponentErrorHandler;

  /**
   * Reply hook called when a component guard denies execution.
   */
  onComponentGuardDenied?: ComponentGuardDeniedHandler;

  /**
   * Reply hook called when a modal customId does not match any registered handler.
   */
  onUnknownModal?: UnknownModalHandler;

  /**
   * Reply hook called when a modal submission throws an unhandled error.
   */
  onModalError?: ModalErrorHandler;

  /**
   * Reply hook called when a modal guard denies execution.
   */
  onModalGuardDenied?: ModalGuardDeniedHandler;

  /**
   * Reply hook called when a context menu command is not found in the registry.
   */
  onUnknownContextMenuCommand?: UnknownContextMenuCommandHandler;

  /**
   * Reply hook called when a context menu command guard denies execution.
   */
  onContextMenuGuardDenied?: ContextMenuGuardDeniedHandler;

  /**
   * Reply hook called when a context menu command throws an unhandled error.
   */
  onContextMenuCommandError?: ContextMenuCommandErrorHandler;

  /**
   * Central telemetry hook for reporting errors to external observability platforms.
   *
   * @remarks
   * Runs alongside user-facing reply hooks without affecting what the user sees in Discord.
   * Any errors thrown by this hook are logged and isolated.
   */
  onError?: ErrorReporter;
}

/**
 * Identity helper for a bot's `error.ts` definition — provides type inference at call site.
 *
 * @param definition - The error boundary handlers and telemetry hooks.
 * @returns The typed error boundary module.
 *
 * @example
 * ```typescript
 * import { defineErrorBoundary } from '@sxnnyside/circe';
 *
 * export default defineErrorBoundary({
 *   onCommandError: (err, ctx) => { ... }
 * });
 * ```
 *
 * @public
 */
export function defineErrorBoundary(definition: ErrorBoundaryModule): ErrorBoundaryModule {
  return definition;
}
