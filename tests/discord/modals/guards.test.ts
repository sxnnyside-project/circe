import { describe, expect, test } from 'bun:test';
import { ModalRegistry } from '../../../src/discord/modals/registry.js';
import { handleModalInteraction } from '../../../src/discord/modals/router.js';
import { defineModal } from '../../../src/discord/modals/types.js';
import { createLogger } from '../../../src/logging/logger.js';
import { testModal } from '../../../src/testing/index.js';

describe('modal guards', () => {
  test('a denying guard replies with its reason and skips execute', async () => {
    let executed = false;
    const modal = defineModal({
      prefix: 'warn:',
      guards: [() => 'Moderators only.'],
      execute: () => {
        executed = true;
      },
    });

    const result = await testModal(modal, { customId: 'warn:1' });

    expect(executed).toBe(false);
    expect(result.replies).toEqual([{ content: 'Moderators only.', ephemeral: true }]);
  });

  test('passing guards let execute run', async () => {
    let executed = false;
    const modal = defineModal({
      prefix: 'warn:',
      guards: [() => true],
      execute: () => {
        executed = true;
      },
    });

    await testModal(modal, { customId: 'warn:1' });

    expect(executed).toBe(true);
  });

  test('onGuardDenied overrides the default reply', async () => {
    const registry = new ModalRegistry();
    registry.register({ prefix: 'warn:', guards: [() => 'raw reason'], execute: () => {} });
    const denials: string[] = [];
    const interaction = {
      customId: 'warn:1',
      deferred: false,
      replied: false,
      guild: null,
      member: null,
      user: { id: 'u1' },
      client: {},
      locale: 'en-US',
      reply: async () => {},
      followUp: async () => {},
    };

    await handleModalInteraction(interaction as never, {
      registry,
      logger: createLogger({ sink: () => {} }),
      onGuardDenied: (_ctx, reason) => {
        denials.push(reason);
      },
    });

    expect(denials).toEqual(['raw reason']);
  });
});
