import type { CommandContext, GuardResult } from '../discord/commands/types.js';
import { createTestContext, type TestContextOptions } from './context.js';

/**
 * Options for testing access control guards.
 *
 * @public
 */
export interface TestGuardOptions extends TestContextOptions {
  /** Explicit context instance to evaluate the guard against, bypassing stub creation. */
  readonly context?: CommandContext;
}

/**
 * Normalized result of evaluating an access control guard.
 *
 * @public
 */
export interface TestGuardResult {
  /** Whether the guard permitted execution (`true`). */
  readonly ok: boolean;
  /** Denial reason string if the guard rejected execution. */
  readonly reason: string | undefined;
}

/**
 * Executes an access control guard function against a stubbed or custom context.
 *
 * @remarks
 * Simplifies unit testing of permission, ownership, role, and custom business logic guards
 * without requiring full command router setups.
 *
 * @param guard - The guard function to evaluate.
 * @param options - Context overrides or pre-constructed test context.
 * @returns A normalized {@link TestGuardResult} containing `ok` and optional `reason`.
 *
 * @example
 * ```typescript
 * import { guildOnly } from '@sxnnyside/circe';
 * import { testGuard } from '@sxnnyside/circe/testing';
 *
 * const dmResult = await testGuard(guildOnly, { guild: null });
 * expect(dmResult.ok).toBe(false);
 *
 * const guildResult = await testGuard(guildOnly);
 * expect(guildResult.ok).toBe(true);
 * ```
 *
 * @public
 */
export async function testGuard(
  guard: (ctx: CommandContext) => GuardResult | Promise<GuardResult>,
  options: TestGuardOptions = {},
): Promise<TestGuardResult> {
  const ctx = options.context ?? createTestContext(options);
  const result = await guard(ctx);

  if (result === true) {
    return { ok: true, reason: undefined };
  }

  return {
    ok: false,
    reason: result,
  };
}
