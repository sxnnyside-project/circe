import type { CommandErrorHandler, GuardDeniedHandler, UnknownCommandHandler } from "../discord/commands/router.js";
import type { ComponentErrorHandler, UnknownComponentHandler } from "../discord/components/router.js";
import type {
  ContextMenuCommandErrorHandler,
  ContextMenuGuardDeniedHandler,
  UnknownContextMenuCommandHandler,
} from "../discord/context-menus/router.js";
import type { ModalErrorHandler, UnknownModalHandler } from "../discord/modals/router.js";

/**
 * A bot's `error.ts` — the same reply-shaping hooks `createCirce()` already
 * accepts as options, discoverable by fixed file name instead of requiring
 * the bot to pass them manually. Every field is optional; an absent one
 * falls back to the router's own plain-ephemeral-reply default.
 */
export interface ErrorBoundaryModule {
  onUnknownCommand?: UnknownCommandHandler;
  onGuardDenied?: GuardDeniedHandler;
  onCommandError?: CommandErrorHandler;
  onUnknownComponent?: UnknownComponentHandler;
  onComponentError?: ComponentErrorHandler;
  onUnknownModal?: UnknownModalHandler;
  onModalError?: ModalErrorHandler;
  onUnknownContextMenuCommand?: UnknownContextMenuCommandHandler;
  onContextMenuGuardDenied?: ContextMenuGuardDeniedHandler;
  onContextMenuCommandError?: ContextMenuCommandErrorHandler;
}

/** Identity helper for a bot's `error.ts` — same purpose as `defineCommand`. */
export function defineErrorBoundary(definition: ErrorBoundaryModule): ErrorBoundaryModule {
  return definition;
}
