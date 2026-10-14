import { describe, expect, test } from 'bun:test';
import type { CommandContext } from '../../../src/discord/commands/types.js';
import { cooldown } from '../../../src/discord/guards/cooldown/cooldown.js';
import { MemoryCooldownStore } from '../../../src/discord/guards/cooldown/memory-store.js';

function fakeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    interaction: { commandName: 'ping', channelId: 'channel-1' },
    guild: { id: 'guild-1' },
    member: null,
    user: { id: 'user-1' },
    client: undefined,
    logger: undefined,
    correlationId: undefined,
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: minimal interaction stub, only the fields the guard reads
  } as any;
}

describe('cooldown', () => {
  test('allows the first call and denies an immediate second call within the same scope', async () => {
    const guard = cooldown({ durationMs: 60_000, scope: 'user' });
    const ctx = fakeCtx();

    expect(await guard(ctx)).toBe(true);
    const second = await guard(ctx);
    expect(typeof second).toBe('string');
    expect(second).toContain('cooldown');
  });

  test("scopes independently by user — a different user is never blocked by another's cooldown", async () => {
    const guard = cooldown({ durationMs: 60_000, scope: 'user' });

    expect(await guard(fakeCtx({ user: { id: 'user-1' } as never }))).toBe(true);
    expect(await guard(fakeCtx({ user: { id: 'user-2' } as never }))).toBe(true);
  });

  test('scopes independently by guild', async () => {
    const guard = cooldown({ durationMs: 60_000, scope: 'guild' });

    expect(await guard(fakeCtx({ guild: { id: 'guild-1' } as never }))).toBe(true);
    expect(await guard(fakeCtx({ guild: { id: 'guild-1' } as never }))).not.toBe(true);
    expect(await guard(fakeCtx({ guild: { id: 'guild-2' } as never }))).toBe(true);
  });

  test('scopes independently by channel', async () => {
    const guard = cooldown({ durationMs: 60_000, scope: 'channel' });

    expect(
      await guard(
        fakeCtx({ interaction: { commandName: 'ping', channelId: 'channel-1' } as never }),
      ),
    ).toBe(true);
    expect(
      await guard(
        fakeCtx({ interaction: { commandName: 'ping', channelId: 'channel-1' } as never }),
      ),
    ).not.toBe(true);
    expect(
      await guard(
        fakeCtx({ interaction: { commandName: 'ping', channelId: 'channel-2' } as never }),
      ),
    ).toBe(true);
  });

  test('allows execution when the guild scope has no guild to key on', async () => {
    const guard = cooldown({ durationMs: 60_000, scope: 'guild' });
    expect(await guard(fakeCtx({ guild: null }))).toBe(true);
    // Calling it again still allows — there was never a scope to record a hit against.
    expect(await guard(fakeCtx({ guild: null }))).toBe(true);
  });

  test('allows again once the store reports the cooldown has expired', async () => {
    const store = new MemoryCooldownStore();
    const guard = cooldown({ durationMs: 60_000, scope: 'user', store });
    const ctx = fakeCtx();

    await guard(ctx);
    expect(await guard(ctx)).not.toBe(true);

    // Simulate expiry by hitting with a duration that's already elapsed.
    store.hit(`ping:user:${ctx.user.id}`, -1);
    expect(await guard(ctx)).toBe(true);

    store.dispose();
  });

  test('keys by command name, so two different commands never share a cooldown', async () => {
    const store = new MemoryCooldownStore();
    const guardA = cooldown({ durationMs: 60_000, scope: 'user', store });
    const guardB = cooldown({ durationMs: 60_000, scope: 'user', store });

    expect(
      await guardA(fakeCtx({ interaction: { commandName: 'a', channelId: 'c' } as never })),
    ).toBe(true);
    expect(
      await guardB(fakeCtx({ interaction: { commandName: 'b', channelId: 'c' } as never })),
    ).toBe(true);

    store.dispose();
  });
});

describe('MemoryCooldownStore', () => {
  test('check returns 0 for a key that was never hit', () => {
    const store = new MemoryCooldownStore();
    expect(store.check('never-hit')).toBe(0);
    store.dispose();
  });

  test('check returns a positive remaining duration right after a hit', () => {
    const store = new MemoryCooldownStore();
    store.hit('key', 10_000);
    const remaining = store.check('key');
    expect(remaining).toBeGreaterThan(9_000);
    expect(remaining).toBeLessThanOrEqual(10_000);
    store.dispose();
  });

  test('check returns 0 once the duration has elapsed, and cleans up the entry', () => {
    const store = new MemoryCooldownStore();
    store.hit('key', -1);
    expect(store.check('key')).toBe(0);
    store.dispose();
  });
});

describe('cooldown across sibling subcommands', () => {
  function leafCtx(subcommand: string) {
    return fakeCtx({
      interaction: {
        commandName: 'config',
        channelId: 'channel-1',
        options: {
          getSubcommandGroup: () => 'roles',
          getSubcommand: () => subcommand,
        },
      } as never,
    });
  }

  test('a shared store keeps each leaf of a command group on its own cooldown', async () => {
    const store = new MemoryCooldownStore();
    const add = cooldown({ durationMs: 60_000, scope: 'user', store });
    const remove = cooldown({ durationMs: 5_000, scope: 'user', store });

    expect(await add(leafCtx('add'))).toBe(true);
    expect(await remove(leafCtx('remove'))).toBe(true);
    expect(typeof (await add(leafCtx('add')))).toBe('string');
    store.dispose();
  });
});
