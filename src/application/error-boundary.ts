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
 * A bot's `error.ts` — the error boundaries and reply-shaping hooks discovered
 * by convention under `scanRoot` (default: `./src/error.ts`).
 *
 * Every field is optional; an absent reply hook falls back to the router's own
 * default ephemeral reply.
 *
 * Includes `onError`: the central telemetry hook for external observability
 * platforms (Sentry, Datadog, OpenTelemetry, Prometheus, Black Pillar).
 *
 * @public
 */
export interface ErrorBoundaryModule {
  onUnknownCommand?: UnknownCommandHandler;
  onGuardDenied?: GuardDeniedHandler;
  onCommandError?: CommandErrorHandler;
  onUnknownComponent?: UnknownComponentHandler;
  onComponentError?: ComponentErrorHandler;
  onComponentGuardDenied?: ComponentGuardDeniedHandler;
  onUnknownModal?: UnknownModalHandler;
  onModalError?: ModalErrorHandler;
  onModalGuardDenied?: ModalGuardDeniedHandler;
  onUnknownContextMenuCommand?: UnknownContextMenuCommandHandler;
  onContextMenuGuardDenied?: ContextMenuGuardDeniedHandler;
  onContextMenuCommandError?: ContextMenuCommandErrorHandler;
  /**
   * Central telemetry hook for reporting errors to external observability platforms.
   * Runs alongside user-facing reply hooks without affecting what the user sees in Discord.
   */
  onError?: ErrorReporter;
}

/**
 * Identity helper for a bot's `error.ts` definition — provides type inference at call site.
 *
 * @public
 */
export function defineErrorBoundary(definition: ErrorBoundaryModule): ErrorBoundaryModule {
  return definition;
}
