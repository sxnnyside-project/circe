import type { MiddlewareModule } from '../application/middleware.js';
import type { ComponentError } from '../discord/components/errors.js';
import { ComponentRegistry } from '../discord/components/registry.js';
import {
  type ComponentRouterOptions,
  handleComponentInteraction,
} from '../discord/components/router.js';
import type { ComponentContext, ComponentDefinition } from '../discord/components/types.js';
import type { LocalizationResolver } from '../localization/resolver.js';
import type { InteractionTelemetryHandler } from '../observability/metrics.js';
import type { ErrorReporter } from '../observability/report-error.js';
import {
  createTestComponentInteraction,
  type TestComponentInteractionOptions,
  type TestReply,
} from './interaction.js';
import { createTestLogger } from './logger.js';
import { createTestExecutionResult, type TestExecutionResult } from './result.js';

/**
 * Configuration options for executing a component handler under test.
 *
 * @public
 */
export interface TestComponentOptions extends TestComponentInteractionOptions {
  /** Custom localization resolver. */
  readonly i18n?: LocalizationResolver;
  /** Middleware module executed prior to guards and component handler. */
  readonly middleware?: MiddlewareModule;
  /** Central error reporting callback. */
  readonly onError?: ErrorReporter;
  /** Custom callback invoked when a guard denies execution. */
  readonly onGuardDenied?: (ctx: ComponentContext, reason: string) => void | Promise<void>;
  /** Custom callback invoked when component execution throws an unhandled error. */
  readonly onComponentError?: (
    ctx: ComponentContext,
    error: ComponentError,
  ) => void | Promise<void>;
  /** Observability callback invoked upon interaction completion. */
  readonly onInteractionComplete?: InteractionTelemetryHandler;
}

/**
 * Result of executing a component under test, providing replies, updates, logs, and assertion helpers.
 *
 * @public
 */
export interface TestComponentResult extends TestExecutionResult {
  /** Every `interaction.update()` call, in order. */
  readonly updates: readonly TestReply[];
  /** The first update payload, or `undefined` if none was sent. */
  readonly update: TestReply | undefined;
  /** Asserts whether an update matching the given criteria was emitted. */
  hasUpdate(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean;
}

/**
 * Runs a button or select menu component through Circe's real routing path —
 * `parse()`, guard evaluation, middleware, `execute()`, and the central error boundary.
 *
 * @param component - The component definition under test.
 * @param options - Custom options for the fabricated component interaction and pipeline.
 * @returns A promise resolving to an ergonomic {@link TestComponentResult}.
 *
 * @example
 * ```typescript
 * import { testComponent } from '@sxnnyside/circe/testing';
 * import buttonHandler from './components/accept.js';
 *
 * const result = await testComponent(buttonHandler, {
 *   customId: 'accept:123',
 * });
 * expect(result.hasUpdate('Accepted!')).toBe(true);
 * ```
 *
 * @public
 */
export async function testComponent<
  Metadata extends Record<string, unknown> = Record<string, never>,
  Params = undefined,
>(
  component: ComponentDefinition<Metadata, Params>,
  options: TestComponentOptions = {},
): Promise<TestComponentResult> {
  const registry = new ComponentRegistry();
  registry.register(component);

  const { logger, entries } = createTestLogger();
  const { interaction, replies, followUps, updates, modals } = createTestComponentInteraction({
    customId: component.prefix,
    ...options,
  });

  const routerOptions: ComponentRouterOptions = {
    registry,
    logger,
    ...(options.i18n !== undefined && { i18n: options.i18n }),
    ...(options.middleware !== undefined && { middleware: options.middleware }),
    ...(options.onError !== undefined && { onError: options.onError }),
    ...(options.onGuardDenied !== undefined && { onGuardDenied: options.onGuardDenied }),
    ...(options.onComponentError !== undefined && { onComponentError: options.onComponentError }),
    ...(options.onInteractionComplete !== undefined && {
      onInteractionComplete: options.onInteractionComplete,
    }),
  };

  await handleComponentInteraction(interaction, routerOptions);

  const baseResult = createTestExecutionResult({
    replies,
    followUps,
    logs: entries,
    modals,
    isDeferred: interaction.deferred,
    isReplied: interaction.replied,
  });

  return {
    ...baseResult,
    updates,
    get update(): TestReply | undefined {
      const u = updates[0];
      if (u === undefined) return undefined;
      return typeof u === 'string' ? ({ content: u } as TestReply) : u;
    },
    hasUpdate(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean {
      return updates.some((u) => {
        if (match === undefined) return true;
        if (typeof match === 'function') return match(u);
        const text = typeof u === 'string' ? u : (u.content ?? '');
        if (typeof match === 'string') return text.includes(match);
        return match.test(text);
      });
    },
  };
}
