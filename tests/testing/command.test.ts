import { describe, expect, test } from 'bun:test';
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../src/discord/commands/types.js';
import type { InteractionMetric } from '../../src/observability/metrics.js';
import { testCommand } from '../../src/testing/command.js';

describe('testCommand options and async lifecycle', () => {
  test('executes a command that reads options and replies', async () => {
    const greetCmd = defineCommand({
      builder: new SlashCommandBuilder().setName('greet').setDescription('Greets a user'),
      execute: async (ctx) => {
        const name = ctx.interaction.options.getString('name') ?? 'stranger';
        await ctx.interaction.reply(`Hello, ${name}!`);
      },
    });

    const result = await testCommand(greetCmd, {
      options: { name: 'Alice' },
    });

    expect(result.hasReply('Hello, Alice!')).toBe(true);
    expect(result.isReplied).toBe(true);
  });

  test('handles deferred replies with editReply', async () => {
    const longRunningCmd = defineCommand({
      builder: new SlashCommandBuilder().setName('slow').setDescription('Performs slow work'),
      execute: async (ctx) => {
        await ctx.interaction.deferReply({ ephemeral: true });
        await ctx.interaction.editReply({ content: 'Work completed!' });
      },
    });

    const result = await testCommand(longRunningCmd);

    expect(result.isDeferred).toBe(true);
    expect(result.hasReply('Work completed!')).toBe(true);
    expect(result.hasEphemeralReply()).toBe(true);
  });

  test('records modals shown via showModal', async () => {
    const openModalCmd = defineCommand({
      builder: new SlashCommandBuilder().setName('modal').setDescription('Opens a modal'),
      execute: async (ctx) => {
        await (
          ctx.interaction as unknown as { showModal: (m: unknown) => Promise<void> }
        ).showModal({
          customId: 'feedback_modal',
          title: 'Submit Feedback',
        });
      },
    });

    const result = await testCommand(openModalCmd);

    expect(result.hasModal('feedback_modal')).toBe(true);
    expect(result.modals).toHaveLength(1);
  });
});

describe('testCommand router integration (middleware, i18n, telemetry)', () => {
  test('executes custom middleware before and after command', async () => {
    const events: string[] = [];
    const middleware = {
      before: (ctx: { name: string }) => {
        events.push(`before:${ctx.name}`);
      },
      after: (ctx: { name: string }) => {
        events.push(`after:${ctx.name}`);
      },
    };

    const cmd = defineCommand({
      builder: new SlashCommandBuilder().setName('ping').setDescription('ping'),
      execute: async (ctx) => {
        events.push('execute');
        await ctx.interaction.reply('pong');
      },
    });

    const result = await testCommand(cmd, { middleware });

    expect(events).toEqual(['before:ping', 'execute', 'after:ping']);
    expect(result.hasReply('pong')).toBe(true);
  });

  test('threads custom i18n resolver through ctx.t', async () => {
    const i18n = {
      resolve: (key: string, locale: string) => {
        return locale === 'es-ES' && key === 'welcome' ? '¡Bienvenido!' : key;
      },
    };

    const cmd = defineCommand({
      builder: new SlashCommandBuilder().setName('welcome').setDescription('welcome'),
      execute: async (ctx) => {
        await ctx.interaction.reply(ctx.t('welcome'));
      },
    });

    const result = await testCommand(cmd, {
      locale: 'es-ES',
      i18n,
    });

    expect(result.hasReply('¡Bienvenido!')).toBe(true);
  });

  test('captures interaction telemetry via onInteractionComplete', async () => {
    let capturedMetric: InteractionMetric | undefined;

    const cmd = defineCommand({
      builder: new SlashCommandBuilder().setName('telemetry').setDescription('telemetry'),
      execute: async (ctx) => {
        await ctx.interaction.reply('recorded');
      },
    });

    await testCommand(cmd, {
      onInteractionComplete: (metric) => {
        capturedMetric = metric;
      },
    });

    expect(capturedMetric).toBeDefined();
    expect(capturedMetric?.name).toBe('telemetry');
    expect(capturedMetric?.status).toBe('success');
    expect(capturedMetric?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
