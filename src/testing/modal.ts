import type { MiddlewareModule } from '../application/middleware.js';
import type { ModalError } from '../discord/modals/errors.js';
import { ModalRegistry } from '../discord/modals/registry.js';
import { handleModalInteraction, type ModalRouterOptions } from '../discord/modals/router.js';
import type { ModalContext, ModalDefinition } from '../discord/modals/types.js';
import type { LocalizationResolver } from '../localization/resolver.js';
import type { InteractionTelemetryHandler } from '../observability/metrics.js';
import type { ErrorReporter } from '../observability/report-error.js';
import { createTestModalInteraction, type TestModalInteractionOptions } from './interaction.js';
import { createTestLogger } from './logger.js';
import { createTestExecutionResult, type TestExecutionResult } from './result.js';

/**
 * Configuration options for executing a modal submission under test.
 *
 * @public
 */
export interface TestModalOptions extends TestModalInteractionOptions {
  /** Custom localization resolver. */
  readonly i18n?: LocalizationResolver;
  /** Middleware module executed prior to guards and modal handler. */
  readonly middleware?: MiddlewareModule;
  /** Central error reporting callback. */
  readonly onError?: ErrorReporter;
  /** Custom callback invoked when a guard denies execution. */
  readonly onGuardDenied?: (ctx: ModalContext, reason: string) => void | Promise<void>;
  /** Custom callback invoked when modal execution throws an unhandled error. */
  readonly onModalError?: (ctx: ModalContext, error: ModalError) => void | Promise<void>;
  /** Observability callback invoked upon interaction completion. */
  readonly onInteractionComplete?: InteractionTelemetryHandler;
}

/**
 * Result of executing a modal under test, providing replies, logs, and assertion helpers.
 *
 * @public
 */
export type TestModalResult = TestExecutionResult;

/**
 * Runs a modal submission through Circe's real routing path — guard evaluation,
 * middleware, `execute()`, and the central error boundary.
 *
 * @param modal - The modal definition under test.
 * @param options - Custom options for the fabricated modal submission and pipeline.
 * @returns A promise resolving to an ergonomic {@link TestModalResult}.
 *
 * @example
 * ```typescript
 * import { testModal } from '@sxnnyside/circe/testing';
 * import feedbackModal from './modals/feedback.js';
 *
 * const result = await testModal(feedbackModal, {
 *   fields: { comments: 'Great bot!' },
 * });
 * expect(result.hasReply('Thanks for your feedback')).toBe(true);
 * ```
 *
 * @public
 */
export async function testModal(
  modal: ModalDefinition,
  options: TestModalOptions = {},
): Promise<TestModalResult> {
  const registry = new ModalRegistry();
  registry.register(modal);

  const { logger, entries } = createTestLogger();
  const { interaction, replies, followUps } = createTestModalInteraction({
    customId: modal.prefix,
    ...options,
  });

  const routerOptions: ModalRouterOptions = {
    registry,
    logger,
    ...(options.i18n !== undefined && { i18n: options.i18n }),
    ...(options.middleware !== undefined && { middleware: options.middleware }),
    ...(options.onError !== undefined && { onError: options.onError }),
    ...(options.onGuardDenied !== undefined && { onGuardDenied: options.onGuardDenied }),
    ...(options.onModalError !== undefined && { onModalError: options.onModalError }),
    ...(options.onInteractionComplete !== undefined && {
      onInteractionComplete: options.onInteractionComplete,
    }),
  };

  await handleModalInteraction(interaction, routerOptions);

  return createTestExecutionResult({
    replies,
    followUps,
    logs: entries,
    isDeferred: interaction.deferred,
    isReplied: interaction.replied,
  });
}
