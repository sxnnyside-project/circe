import type { Logger } from "../logging/logger.js";

export type MiddlewareKind = "command" | "context-menu" | "component" | "modal";

export interface MiddlewareContext {
  readonly kind: MiddlewareKind;
  /** Command name, component/modal customId, or context menu command name — whichever identifies this interaction. */
  readonly name: string;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
}

export interface MiddlewareModule {
  /** Runs before guards and `execute`. Throwing here skips execution and is reported through the same error boundary `execute` throwing would use. */
  before?(ctx: MiddlewareContext): void | Promise<void>;
  /** Runs once the interaction has settled — success, guard denial, or error alike. */
  after?(ctx: MiddlewareContext): void | Promise<void>;
}

/** Identity helper for a bot's `middleware.ts` — same purpose as `defineCommand`. */
export function defineMiddleware(definition: MiddlewareModule): MiddlewareModule {
  return definition;
}

/**
 * Runs `fn` (a router's guard-then-execute sequence) wrapped by the
 * optional `before`/`after` hooks. `after` always runs — success, thrown
 * error, or early `return` from `fn` — because it sits in a `finally`.
 * `before` throwing propagates to the caller's own try/catch exactly like
 * `fn` throwing would, so a bad middleware hook is reported through the
 * same error boundary as a bad command.
 *
 * `getContext` is a factory, not a value — most bots have no `middleware.ts`
 * at all, and that's the hot path every single interaction goes through.
 * Building a `MiddlewareContext` object on every interaction just to hand
 * it to a `middleware` that doesn't exist would be a wasted per-interaction
 * allocation; skipping straight to `fn()` when there's no middleware avoids
 * it entirely.
 */
export async function runWithMiddleware(
  middleware: MiddlewareModule | undefined,
  getContext: () => MiddlewareContext,
  fn: () => Promise<void>,
): Promise<void> {
  if (!middleware) {
    return fn();
  }

  const ctx = getContext();
  try {
    await middleware.before?.(ctx);
    await fn();
  } finally {
    await middleware.after?.(ctx);
  }
}
