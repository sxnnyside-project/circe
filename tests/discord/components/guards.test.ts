import { describe, expect, test } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import { defineComponent } from '../../../src/discord/components/types.js';
import { invokerOnly } from '../../../src/discord/guards/invoker-only.js';
import { hasPermission } from '../../../src/discord/guards/permissions.js';
import { testComponent } from '../../../src/testing/index.js';

describe('component guards', () => {
  test('a denying guard replies with its reason and skips execute', async () => {
    let executed = false;
    const component = defineComponent({
      prefix: 'cfg:',
      guards: [() => 'Nope.'],
      execute: () => {
        executed = true;
      },
    });

    const result = await testComponent(component, { customId: 'cfg:save' });

    expect(executed).toBe(false);
    expect(result.replies).toEqual([{ content: 'Nope.', ephemeral: true }]);
  });

  test('guards run in order and the first denial wins', async () => {
    const calls: string[] = [];
    const component = defineComponent({
      prefix: 'cfg:',
      guards: [
        () => {
          calls.push('first');
          return 'first denies';
        },
        () => {
          calls.push('second');
          return true;
        },
      ],
      execute: () => {},
    });

    const result = await testComponent(component, { customId: 'cfg:x' });

    expect(calls).toEqual(['first']);
    expect(result.replies[0]?.content).toBe('first denies');
  });

  test('guards see the parsed params of a pattern component', async () => {
    let seen: string | undefined;
    const component = defineComponent({
      pattern: 'ticket:close:[userId]',
      guards: [
        (ctx) => {
          seen = ctx.params.userId;
          return ctx.params.userId === ctx.user.id ? true : 'Not yours.';
        },
      ],
      execute: () => {},
    });

    const allowed = await testComponent(component, { customId: 'ticket:close:test-user' });
    expect(seen).toBe('test-user');
    expect(allowed.replies).toEqual([]);

    const denied = await testComponent(component, { customId: 'ticket:close:someone-else' });
    expect(denied.replies[0]?.content).toBe('Not yours.');
  });

  test('invokerOnly and hasPermission work as component guards', async () => {
    let runs = 0;
    const component = defineComponent({
      prefix: 'panel:',
      guards: [invokerOnly(), hasPermission(PermissionFlagsBits.ManageGuild)],
      execute: () => {
        runs += 1;
      },
    });

    const stranger = await testComponent(component, {
      customId: 'panel:open',
      message: { interactionMetadata: { user: { id: 'owner' } } },
    });
    expect(stranger.replies).toHaveLength(1);
    expect(runs).toBe(0);
  });

  test('a throwing guard goes through the component error boundary', async () => {
    const component = defineComponent({
      prefix: 'cfg:',
      guards: [
        () => {
          throw new Error('guard exploded');
        },
      ],
      execute: () => {},
    });

    const result = await testComponent(component, { customId: 'cfg:x' });

    expect(result.replies[0]?.content).toContain('Something went wrong');
  });
});
