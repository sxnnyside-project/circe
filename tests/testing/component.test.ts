import { describe, expect, test } from 'bun:test';
import { defineComponent } from '../../src/discord/components/types.js';
import { testComponent } from '../../src/testing/component.js';

describe('testComponent', () => {
  test('runs a prefix-based component through the real router', async () => {
    const component = defineComponent({
      prefix: 'crate:save:',
      async execute(ctx) {
        await ctx.interaction.update({ content: 'saved' });
      },
    });

    const result = await testComponent(component, { customId: 'crate:save:123' });

    expect(result.updates).toEqual([{ content: 'saved' }]);
  });

  test('runs a pattern-based component with typed params through the real router', async () => {
    const component = defineComponent({
      pattern: 'ticket:close:[userId]:[action]',
      async execute(ctx) {
        await ctx.interaction.update({ content: `${ctx.params.userId}:${ctx.params.action}` });
      },
    });

    const result = await testComponent(component, { customId: 'ticket:close:9841:archive' });

    expect(result.updates).toEqual([{ content: '9841:archive' }]);
  });

  test('routes error boundary failures through the default ephemeral reply', async () => {
    const component = defineComponent({
      prefix: 'crate:save:',
      execute: async () => {
        throw new Error('boom');
      },
    });

    const result = await testComponent(component, { customId: 'crate:save:123' });

    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]?.ephemeral).toBe(true);
  });

  test('ctx.t is available and defaults to returning the key verbatim', async () => {
    let translated: string | undefined;
    const component = defineComponent({
      prefix: 'crate:save:',
      async execute(ctx) {
        translated = ctx.t('greeting.hello');
        await ctx.interaction.update({ content: 'ok' });
      },
    });

    await testComponent(component, { customId: 'crate:save:123' });

    expect(translated).toBe('greeting.hello');
  });

  test('supports select menus with values and fluent hasUpdate', async () => {
    const selectMenu = defineComponent({
      prefix: 'role_select:',
      async execute(ctx) {
        const roles = ctx.interaction.isAnySelectMenu() ? ctx.interaction.values : [];
        await ctx.interaction.update(`Selected roles: ${roles.join(', ')}`);
      },
    });

    const result = await testComponent(selectMenu, {
      customId: 'role_select:roles',
      values: ['mod', 'vip'],
    });

    expect(result.hasUpdate('Selected roles: mod, vip')).toBe(true);
    expect(result.update?.content).toBe('Selected roles: mod, vip');
  });

  test('executes middleware and records telemetry', async () => {
    let telemetryHit = false;
    const component = defineComponent({
      prefix: 'btn:click:',
      async execute(ctx) {
        await ctx.interaction.reply({ content: 'Clicked', ephemeral: true });
      },
    });

    const result = await testComponent(component, {
      customId: 'btn:click:1',
      onInteractionComplete: (metric) => {
        if (metric.name === 'btn:click:1') telemetryHit = true;
      },
    });

    expect(result.hasEphemeralReply('Clicked')).toBe(true);
    expect(telemetryHit).toBe(true);
  });
});
