import type { Logger } from '../logging/logger.js';

/**
 * The category of interaction routed through the middleware pipeline.
 *
 * @public
 */
export type MiddlewareKind = 'command' | 'context-menu' | 'component' | 'modal';

/**
 * Context passed to {@link MiddlewareModule.before} and {@link MiddlewareModule.after} hooks.
 *
 * @public
 */
export interface MiddlewareContext {
  /** The kind of interaction being executed. */
  readonly kind: MiddlewareKind;
  /**
   * Identifying name of the target: command name, customId, or context menu name.
   */
  readonly name: string;
  /**
   * Component-scoped logger carrying interaction metadata and correlation ID.
   */
  readonly logger: Logger;
  /**
   * Unique UUID v4 correlation ID tracing this interaction through logs and telemetry.
   */
  readonly correlationId: string | undefined;
}

/**
 * Defines interceptor hooks executed around interaction handling.
 *
 * @remarks
 * Discovered by convention at `./src/middleware.ts` (or configured via `circe.config.ts`).
 *
 * @example
 * ```typescript
 * import { defineMiddleware } from '@sxnnyside/circe';
 *
 * export default defineMiddleware({
 *   before(ctx) {
 *     ctx.logger.info(`Starting interaction: ${ctx.name}`, { kind: ctx.kind });
 *   },
 *   after(ctx) {
 *     ctx.logger.info(`Settled interaction: ${ctx.name}`);
 *   },
 * });
 * ```
 *
 * @public
 */
export interface MiddlewareModule {
  /**
   * Runs before guards and command execution.
   *
   * @remarks
   * Throwing an error from this hook skips execution and routes through the standard error boundary.
   *
   * @param ctx - The contextual metadata for the incoming interaction.
   */
  before?(ctx: MiddlewareContext): void | Promise<void>;

  /**
   * Runs once the interaction has settled (success, guard denial, or failure alike).
   *
   * @remarks
   * Guaranteed to execute via a `finally` block. An error it throws is logged and does not replace the interaction's outcome.
   *
   * @param ctx - The contextual metadata for the settled interaction.
   */
  after?(ctx: MiddlewareContext): void | Promise<void>;
}

/**
 * Identity helper for declaring a bot's `middleware.ts` with strict TypeScript inference.
 *
 * @param definition - The middleware hooks implementation.
 * @returns The validated middleware module.
 *
 * @example
 * ```typescript
 * import { defineMiddleware } from '@sxnnyside/circe';
 *
 * export default defineMiddleware({
 *   before(ctx) { ... }
 * });
 * ```
 *
 * @public
 */
export function defineMiddleware(definition: MiddlewareModule): MiddlewareModule {
  return definition;
}

/**
 * Executes an async interaction action wrapped by optional `before` and `after` middleware hooks.
 *
 * @remarks
 * **Optimization:** When `middleware` is `undefined`, skips calling `getContext()` entirely,
 * achieving zero allocations on the high-frequency interaction hot-path.
 *
 * @param middleware - The optional middleware definition.
 * @param getContext - Lazy factory creating {@link MiddlewareContext} only when middleware is active.
 * @param fn - The core execution delegate (guards + router action).
 * @returns A promise that resolves when both the action and `after` hook settle.
 *
 * @internal
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
    // A failing `after` is logged, never thrown: it would otherwise replace the real failure
    // (or turn a successful interaction into an error) in the router's error boundary.
    try {
      await middleware.after?.(ctx);
    } catch (error) {
      ctx.logger.error('Middleware after hook threw', { error });
    }
  }
}
