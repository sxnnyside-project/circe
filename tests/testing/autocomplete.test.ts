import { describe, expect, test } from 'bun:test';
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../src/discord/commands/types.js';
import type { InteractionMetric } from '../../src/observability/metrics.js';
import { testAutocomplete } from '../../src/testing/autocomplete.js';

describe('testAutocomplete', () => {
  const fruits = ['Apple', 'Apricot', 'Avocado', 'Banana', 'Blueberry', 'Cherry'];

  const fruitCmd = defineCommand({
    builder: new SlashCommandBuilder().setName('fruit').setDescription('Pick a fruit'),
    autocomplete: async (ctx) => {
      const focused = String(ctx.interaction.options.getFocused());
      const filtered = fruits
        .filter((f) => f.toLowerCase().includes(focused.toLowerCase()))
        .map((name) => ({ name, value: name.toLowerCase() }));
      await ctx.interaction.respond(filtered);
    },
    execute: async () => {},
  });

  test('filters and returns autocomplete choices based on focused input', async () => {
    const result = await testAutocomplete(fruitCmd, {
      focusedOption: { name: 'fruit', value: 'ap' },
    });

    expect(result.choices).toHaveLength(2);
    expect(result.hasChoice('Apple')).toBe(true);
    expect(result.hasChoice('Apricot')).toBe(true);
    expect(result.hasChoice('Banana')).toBe(false);
  });

  test('returns empty choices when input matches nothing', async () => {
    const result = await testAutocomplete(fruitCmd, {
      focusedOption: { name: 'fruit', value: 'zzz' },
    });

    expect(result.choices).toHaveLength(0);
    expect(result.hasChoice('Apple')).toBe(false);
  });

  test('safely catches error when autocomplete handler throws and logs it', async () => {
    const failingCmd = defineCommand({
      builder: new SlashCommandBuilder().setName('broken').setDescription('Broken autocomplete'),
      autocomplete: () => {
        throw new Error('Database lookup failed');
      },
      execute: async () => {},
    });

    const result = await testAutocomplete(failingCmd);

    expect(result.choices).toHaveLength(0);
    expect(result.logs.some((l) => l.level === 'error')).toBe(true);
  });

  test('emits telemetry metric on completion', async () => {
    let captured: InteractionMetric | undefined;

    await testAutocomplete(fruitCmd, {
      focusedOption: { name: 'fruit', value: 'ban' },
      onInteractionComplete: (metric) => {
        captured = metric;
      },
    });

    expect(captured).toBeDefined();
    expect(captured?.kind).toBe('autocomplete');
    expect(captured?.status).toBe('success');
  });
});
