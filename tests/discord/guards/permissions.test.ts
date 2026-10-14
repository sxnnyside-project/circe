import { describe, expect, test } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import type { CommandContext } from '../../../src/discord/commands/types.js';
import { guildOnly } from '../../../src/discord/guards/guild-only.js';
import { hasPermission } from '../../../src/discord/guards/permissions.js';

function makeCtx(permissions: bigint[], overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    guild: { id: 'guild-1' } as never,
    member: {
      permissions: {
        has: (permission: bigint) => permissions.includes(permission),
      },
    } as never,
    interaction: {} as never,
    client: {} as never,
    user: {} as never,
    logger: {} as never,
    correlationId: undefined,
    t: (key: string) => key,
    ...overrides,
  };
}

describe('hasPermission', () => {
  test('passes when the member has the required permission', async () => {
    const guard = hasPermission(PermissionFlagsBits.BanMembers);
    const result = await guard(makeCtx([PermissionFlagsBits.BanMembers]));
    expect(result).toBe(true);
  });

  test('denies when the member lacks the required permission', async () => {
    const guard = hasPermission(PermissionFlagsBits.BanMembers);
    const result = await guard(makeCtx([]));
    expect(result).not.toBe(true);
    expect(typeof result).toBe('string');
  });

  test('requires every listed permission, not just one', async () => {
    const guard = hasPermission(PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers);
    const result = await guard(makeCtx([PermissionFlagsBits.BanMembers]));
    expect(result).not.toBe(true);
  });

  test('denies outside a guild (no resolvable member)', async () => {
    const guard = hasPermission(PermissionFlagsBits.BanMembers);
    const result = await guard(makeCtx([], { member: null }));
    expect(result).not.toBe(true);
  });

  test('guards compose: guildOnly and hasPermission both must pass', async () => {
    const guards = [guildOnly(), hasPermission(PermissionFlagsBits.BanMembers)];
    const ctx = makeCtx([PermissionFlagsBits.BanMembers]);

    for (const guard of guards) {
      expect(await guard(ctx)).toBe(true);
    }
  });

  test('guards compose: the first failing guard in the list determines the denial', async () => {
    const guards = [guildOnly(), hasPermission(PermissionFlagsBits.BanMembers)];
    const ctx = makeCtx([PermissionFlagsBits.BanMembers], { guild: null });

    const results = await Promise.all(guards.map((guard) => guard(ctx)));
    expect(results[0]).not.toBe(true);
  });
});
