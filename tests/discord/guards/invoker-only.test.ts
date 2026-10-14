import { describe, expect, test } from 'bun:test';
import { invokerOnly } from '../../../src/discord/guards/invoker-only.js';

function ctx(userId: string, ownerId: string | undefined, customId = 'test:') {
  return {
    user: { id: userId } as never,
    interaction: {
      customId,
      message: ownerId === undefined ? null : { interactionMetadata: { user: { id: ownerId } } },
    } as never,
  };
}

describe('invokerOnly', () => {
  test('allows the user who triggered the originating interaction', () => {
    expect(invokerOnly()(ctx('u1', 'u1'))).toBe(true);
  });

  test('denies any other user', () => {
    expect(invokerOnly()(ctx('u2', 'u1'))).not.toBe(true);
  });

  test('denies when ownership cannot be established', () => {
    expect(invokerOnly()(ctx('u1', undefined))).not.toBe(true);
  });

  test('resolveOwnerId takes precedence over the message metadata', () => {
    const guard = invokerOnly({ resolveOwnerId: (c) => c.interaction.customId.split(':')[1] });
    expect(guard(ctx('u9', 'u1', 'cfg:u9'))).toBe(true);
    expect(guard(ctx('u1', 'u1', 'cfg:u9'))).not.toBe(true);
  });
});
