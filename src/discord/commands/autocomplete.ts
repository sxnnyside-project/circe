import { type AutocompleteInteraction, type Client, Events, type Interaction } from 'discord.js';
import { normalizeError } from '../../errors/normalize-error.js';
import { IdentityI18nResolver } from '../../i18n/identity-resolver.js';
import { createTranslator, i18nContextOf } from '../../i18n/translator.js';
import type { I18nResolver } from '../../i18n/types.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import { CommandError } from './errors.js';
import type { CommandRegistry } from './registry.js';
import type { AutocompleteContext } from './types.js';

export interface AutocompleteRouterOptions {
  registry: CommandRegistry;
  logger: Logger;
  /** Defaults to a resolver that returns every key verbatim, untranslated. */
  i18n?: I18nResolver;
}

const defaultI18nResolver = new IdentityI18nResolver();

/**
 * Discord requires an autocomplete response within 3 seconds and only
 * accepts a choice list — there's no "reply with an error message" option
 * the way a command interaction has. An empty list is the only safe
 * fallback, both for an unknown target and for a handler that threw.
 */
async function respondEmpty(interaction: AutocompleteInteraction): Promise<void> {
  try {
    await interaction.respond([]);
  } catch {
    // The interaction may have already expired — nothing more to do.
  }
}

/**
 * Handles a single autocomplete interaction: resolves the target command,
 * runs its `autocomplete` handler, and funnels any failure through the same
 * error boundary commands use. Kept separate from `attachAutocompleteRouter`
 * so it can be exercised with a hand-built interaction stub in tests.
 */
export async function handleAutocompleteInteraction(
  interaction: AutocompleteInteraction,
  options: AutocompleteRouterOptions,
): Promise<void> {
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ command: interaction.commandName, autocomplete: true });
    const command = options.registry.get(interaction.commandName);

    if (!command?.autocomplete) {
      logger.warn('Received autocomplete interaction for a command with no autocomplete handler', {
        command: interaction.commandName,
      });
      await respondEmpty(interaction);
      return;
    }

    const ctx: AutocompleteContext = {
      interaction,
      client: interaction.client,
      guild: interaction.guild,
      logger,
      correlationId,
      t: createTranslator(
        options.i18n ?? defaultI18nResolver,
        interaction.locale,
        i18nContextOf(interaction),
      ),
    };

    try {
      await command.autocomplete(ctx);
    } catch (error) {
      const normalized = normalizeError(
        error,
        `Autocomplete for "${interaction.commandName}" failed`,
      );
      const commandError =
        normalized instanceof CommandError
          ? normalized
          : new CommandError(normalized.message, {
              cause: normalized,
              operational: normalized.operational,
              metadata: {
                ...normalized.metadata,
                reason: 'autocomplete-failed',
                command: interaction.commandName,
              },
            });
      logger.error(commandError.message, {
        error: commandError,
        correlationId: commandError.correlationId,
      });
      await respondEmpty(interaction);
    }
  });
}

/** Wires autocomplete routing onto a live discord.js client's `interactionCreate` event. */
export function attachAutocompleteRouter(client: Client, options: AutocompleteRouterOptions): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isAutocomplete()) {
      return;
    }
    void handleAutocompleteInteraction(interaction, options);
  });
}
