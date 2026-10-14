import { describe, expect, test } from 'bun:test';
import { SlashCommandBuilder } from 'discord.js';
import { handleAutocompleteInteraction } from '../../../src/discord/commands/autocomplete.js';
import { CommandError } from '../../../src/discord/commands/errors.js';
import { CommandRegistry } from '../../../src/discord/commands/registry.js';
import type { AutocompleteContext } from '../../../src/discord/commands/types.js';
import { getCorrelationId } from '../../../src/logging/context.js';
import { createLogger, type LogEntry } from '../../../src/logging/logger.js';

function makeInteraction(commandName: string) {
  const responded: unknown[][] = [];
  const interaction = {
    commandName,
    respond: async (choices: unknown[]) => {
      responded.push(choices);
    },
  };
  return { interaction, responded };
}

function silentLogger(): { logger: ReturnType<typeof createLogger>; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

describe('handleAutocompleteInteraction', () => {
  test('responds with an empty list for an unregistered command', async () => {
    const registry = new CommandRegistry();
    const { logger } = silentLogger();
    const { interaction, responded } = makeInteraction('missing');

    await handleAutocompleteInteraction(interaction as never, { registry, logger });

    expect(responded).toEqual([[]]);
  });

  test('responds with an empty list when the command has no autocomplete handler', async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName('search').setDescription('search'),
      execute: async () => {},
    });

    const { logger } = silentLogger();
    const { interaction, responded } = makeInteraction('search');

    await handleAutocompleteInteraction(interaction as never, { registry, logger });

    expect(responded).toEqual([[]]);
  });

  test("routes to the command's autocomplete handler and lets it call .respond() directly", async () => {
    const registry = new CommandRegistry();
    let executed = false;
    registry.register({
      builder: new SlashCommandBuilder().setName('search').setDescription('search'),
      autocomplete: async (ctx: AutocompleteContext) => {
        executed = true;
        await ctx.interaction.respond([{ name: 'Dark Side of the Moon', value: 'dark-side' }]);
      },
      execute: async () => {},
    });

    const { logger } = silentLogger();
    const { interaction, responded } = makeInteraction('search');

    await handleAutocompleteInteraction(interaction as never, { registry, logger });

    expect(executed).toBe(true);
    expect(responded).toEqual([[{ name: 'Dark Side of the Moon', value: 'dark-side' }]]);
  });

  test('a handler that throws is caught and results in an empty-list fallback response', async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName('search').setDescription('search'),
      autocomplete: async () => {
        throw new Error('boom');
      },
      execute: async () => {},
    });

    const { logger, entries } = silentLogger();
    const { interaction, responded } = makeInteraction('search');

    await handleAutocompleteInteraction(interaction as never, { registry, logger });

    expect(responded).toEqual([[]]);
    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  test('regression: an autocomplete failure is logged as a CommandError, not a generic CirceError', async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName('search').setDescription('search'),
      autocomplete: async () => {
        throw new Error('boom');
      },
      execute: async () => {},
    });

    const { logger, entries } = silentLogger();
    const { interaction } = makeInteraction('search');

    await handleAutocompleteInteraction(interaction as never, { registry, logger });

    const errorEntry = entries.find((entry) => entry.level === 'error');
    expect(errorEntry?.metadata.error).toBeInstanceOf(CommandError);
  });

  test('establishes a fresh correlation ID for each invocation and attaches it to the context', async () => {
    const registry = new CommandRegistry();
    const seenIds: (string | undefined)[] = [];

    registry.register({
      builder: new SlashCommandBuilder().setName('search').setDescription('search'),
      autocomplete: async (ctx: AutocompleteContext) => {
        seenIds.push(ctx.correlationId);
        expect(ctx.correlationId).toBe(getCorrelationId());
        await ctx.interaction.respond([]);
      },
      execute: async () => {},
    });

    const { logger } = silentLogger();

    await handleAutocompleteInteraction(makeInteraction('search').interaction as never, {
      registry,
      logger,
    });
    await handleAutocompleteInteraction(makeInteraction('search').interaction as never, {
      registry,
      logger,
    });

    expect(seenIds).toHaveLength(2);
    expect(seenIds[0]).toBeDefined();
    expect(seenIds[0]).not.toBe(seenIds[1]);
  });
});

describe('handleAutocompleteInteraction — ctx.t', () => {
  test('translates for the interaction locale with its guild context', async () => {
    const registry = new CommandRegistry();
    let translated: string | undefined;
    let context: unknown;
    registry.register({
      builder: new SlashCommandBuilder().setName('search').setDescription('search'),
      autocomplete: (ctx) => {
        translated = ctx.t('choices.recent');
      },
      execute: async () => {},
    });
    const { logger } = silentLogger();
    const { interaction } = makeInteraction('search');

    await handleAutocompleteInteraction(
      {
        ...interaction,
        locale: 'pt-BR',
        guildId: 'g1',
        guildLocale: 'es-ES',
        user: { id: 'u1' },
      } as never,
      {
        registry,
        logger,
        i18n: {
          resolve: (key, locale, _params, ctx) => {
            context = ctx;
            return `[${locale}] ${key}`;
          },
        },
      },
    );

    expect(translated).toBe('[pt-BR] choices.recent');
    expect(context).toEqual({ guildId: 'g1', guildLocale: 'es-ES', userId: 'u1' });
  });

  test('returns the key verbatim when no resolver is configured', async () => {
    const registry = new CommandRegistry();
    let translated: string | undefined;
    registry.register({
      builder: new SlashCommandBuilder().setName('search').setDescription('search'),
      autocomplete: (ctx) => {
        translated = ctx.t('choices.recent');
      },
      execute: async () => {},
    });
    const { logger } = silentLogger();
    const { interaction } = makeInteraction('search');

    await handleAutocompleteInteraction({ ...interaction, locale: 'en-US' } as never, {
      registry,
      logger,
    });

    expect(translated).toBe('choices.recent');
  });
});
