import type {
  ApplicationCommandOptionChoiceData,
  AutocompleteInteraction,
  Client,
  Guild,
  User,
} from 'discord.js';
import {
  type AutocompleteRouterOptions,
  handleAutocompleteInteraction,
} from '../discord/commands/autocomplete.js';
import { CommandRegistry } from '../discord/commands/registry.js';
import type { CommandDefinition } from '../discord/commands/types.js';
import type { LocalizationResolver } from '../localization/resolver.js';
import type { LogEntry } from '../logging/logger.js';
import type { InteractionTelemetryHandler } from '../observability/metrics.js';
import type { TestInteractionOptions } from './interaction.js';
import { createTestLogger } from './logger.js';

/**
 * Focused option input payload for testing autocomplete.
 *
 * @public
 */
export interface TestFocusedOption {
  /** The name of the option currently being typed. */
  readonly name: string;
  /** The current value typed by the user. */
  readonly value: string | number;
}

/**
 * Configuration options for testing command option autocomplete.
 *
 * @public
 */
export interface TestAutocompleteOptions extends TestInteractionOptions {
  /** The focused option being typed by the user. Default: `{ name: 'query', value: '' }`. */
  readonly focusedOption?: TestFocusedOption;
  /** Custom localization resolver. */
  readonly i18n?: LocalizationResolver;
  /** Observability callback invoked upon interaction completion. */
  readonly onInteractionComplete?: InteractionTelemetryHandler;
}

/**
 * Result of testing a command's autocomplete handler.
 *
 * @public
 */
export interface TestAutocompleteResult {
  /** The choices sent to `interaction.respond()`, in order. */
  readonly choices: readonly ApplicationCommandOptionChoiceData[];
  /** Structured logs emitted during autocomplete execution. */
  readonly logs: readonly LogEntry[];
  /**
   * Asserts whether a choice matching the given name, value, or predicate was emitted.
   *
   * @param match - Choice name substring, exact value, or choice predicate.
   * @returns `true` if at least one matching choice was responded with; otherwise `false`.
   */
  hasChoice(
    match: string | number | ((choice: ApplicationCommandOptionChoiceData) => boolean),
  ): boolean;
}

/**
 * Executes a command's autocomplete handler through Circe's real autocomplete router.
 *
 * @remarks
 * Tests focused option resolution, input filtering, error recovery (falling back to empty array),
 * and choice emission without requiring live Discord gateway connections.
 *
 * @param command - The command definition with an `autocomplete` handler.
 * @param options - Configuration options for focused option and command state.
 * @returns A promise resolving to an ergonomic {@link TestAutocompleteResult}.
 *
 * @example
 * ```typescript
 * import { testAutocomplete } from '@sxnnyside/circe/testing';
 * import tagCommand from './commands/tag.js';
 *
 * const result = await testAutocomplete(tagCommand, {
 *   focusedOption: { name: 'name', value: 'disc' },
 * });
 * expect(result.hasChoice('discord.js')).toBe(true);
 * ```
 *
 * @public
 */
export async function testAutocomplete(
  command: CommandDefinition,
  options: TestAutocompleteOptions = {},
): Promise<TestAutocompleteResult> {
  const registry = new CommandRegistry();
  registry.register(command);

  const { logger, entries } = createTestLogger();
  const choices: ApplicationCommandOptionChoiceData[] = [];
  const focused: TestFocusedOption = options.focusedOption ?? { name: 'query', value: '' };
  const optValues = options.options ?? {};

  const interaction = {
    commandName: command.builder.name,
    guild: options.guild === undefined ? ({ id: 'test-guild' } as Guild) : options.guild,
    member: options.member ?? null,
    user: options.user ?? ({ id: 'test-user', username: 'test-user' } as User),
    client: options.client ?? ({} as Client),
    locale: options.locale ?? 'en-US',
    options: {
      getFocused: (full?: boolean) => {
        if (full) {
          return { name: focused.name, value: focused.value };
        }
        return focused.value;
      },
      getString: (name: string) => {
        if (name === focused.name) return String(focused.value);
        const val = optValues[name];
        return val !== undefined ? String(val) : null;
      },
      getInteger: (name: string) => {
        if (name === focused.name) return Math.trunc(Number(focused.value));
        const val = optValues[name];
        return val !== undefined ? Math.trunc(Number(val)) : null;
      },
      getNumber: (name: string) => {
        if (name === focused.name) return Number(focused.value);
        const val = optValues[name];
        return val !== undefined ? Number(val) : null;
      },
      getBoolean: (name: string) => {
        const val = optValues[name];
        return val !== undefined ? Boolean(val) : null;
      },
      get: (name: string) => {
        if (name === focused.name) return { name: focused.name, value: focused.value };
        const val = optValues[name];
        return val !== undefined ? { name, value: val } : null;
      },
    },
    respond: async (items: ApplicationCommandOptionChoiceData[]) => {
      choices.push(...items);
    },
  } as unknown as AutocompleteInteraction;

  const routerOptions: AutocompleteRouterOptions = {
    registry,
    logger,
    ...(options.i18n !== undefined && { i18n: options.i18n }),
    ...(options.onInteractionComplete !== undefined && {
      onInteractionComplete: options.onInteractionComplete,
    }),
  };

  await handleAutocompleteInteraction(interaction, routerOptions);

  return {
    choices,
    logs: entries,
    hasChoice(
      match: string | number | ((choice: ApplicationCommandOptionChoiceData) => boolean),
    ): boolean {
      return choices.some((c) => {
        if (typeof match === 'function') return match(c);
        if (typeof match === 'number') return c.value === match;
        return c.name.includes(match) || String(c.value).includes(match);
      });
    },
  };
}
