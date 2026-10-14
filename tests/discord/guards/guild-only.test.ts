import { describe, expect, test } from 'bun:test';
import type { CommandContext } from '../../../src/discord/commands/types.js';
import { guildOnly } from '../../../src/discord/guards/guild-only.js';

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    guild: { id: 'guild-1' } as never,
    member: null,
    interaction: {} as never,
    client: {} as never,
    user: {} as never,
    logger: {} as never,
    correlationId: undefined,
    t: (key: string) => key,
    ...overrides,
  };
}

describe('guildOnly', () => {
  test('passes when the context has a guild', async () => {
    const guard = guildOnly();
    expect(await guard(makeCtx({ guild: { id: 'guild-1' } as never }))).toBe(true);
  });

  test('denies with a reason when the context has no guild', async () => {
    const guard = guildOnly();
    const result = await guard(makeCtx({ guild: null }));
    expect(result).not.toBe(true);
    expect(typeof result).toBe('string');
  });
});
