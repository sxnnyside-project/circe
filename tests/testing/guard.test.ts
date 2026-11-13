import { describe, expect, test } from 'bun:test';
import { guildOnly } from '../../src/discord/guards/guild-only.js';
import { createTestContext } from '../../src/testing/context.js';
import { testGuard } from '../../src/testing/guard.js';
import { createMockUser } from '../../src/testing/mock.js';

describe('testGuard', () => {
  test('evaluates built-in guildOnly guard on default context (in a guild)', async () => {
    const result = await testGuard(guildOnly());
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('evaluates built-in guildOnly guard in DM context', async () => {
    const result = await testGuard(guildOnly(), { guild: null });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('This command can only be used in a server.');
  });

  test('evaluates custom synchronous guard', async () => {
    const customGuard = (ctx: { user: { id: string } }) => {
      return ctx.user.id === 'admin-id' ? true : 'Access denied: not an admin';
    };

    const denied = await testGuard(customGuard, {
      user: createMockUser({ id: 'regular-user' }),
    });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe('Access denied: not an admin');

    const allowed = await testGuard(customGuard, {
      user: createMockUser({ id: 'admin-id' }),
    });
    expect(allowed.ok).toBe(true);
    expect(allowed.reason).toBeUndefined();
  });

  test('accepts explicit pre-built context', async () => {
    const explicitCtx = createTestContext({ guild: null });
    const result = await testGuard(guildOnly(), { context: explicitCtx });
    expect(result.ok).toBe(false);
  });
});
