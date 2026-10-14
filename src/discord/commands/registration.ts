import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  PermissionsBitField,
  type RESTPostAPIApplicationCommandsJSONBody,
  Routes,
} from 'discord.js';
import type { Logger } from '../../logging/logger.js';
import type {
  ContextMenuRegistrationOptions,
  MessageCommandDefinition,
  UserCommandDefinition,
} from '../context-menus/types.js';
import { CommandError } from './errors.js';
import type { CommandDefinition } from './types.js';

/**
 * The minimal shape Circe needs from a REST client to register commands.
 * `discord.js`'s own `REST` instance satisfies this — it's declared
 * separately so registration can be unit tested with a plain stub instead
 * of a real client or a mock-Discord library.
 */
export interface CommandRest {
  put(route: string, options: { body: unknown }): Promise<unknown>;
}

export interface RegisterCommandsOptions {
  rest: CommandRest;
  clientId: string;
  /** Guild-scoped registration when present (dev/staging); global otherwise (production). */
  guildId?: string;
  commands: readonly CommandDefinition[];
  /** Context menu commands are registered in the same bulk `PUT` — Discord's endpoint accepts all command types together. */
  userContextMenuCommands?: readonly UserCommandDefinition[];
  messageContextMenuCommands?: readonly MessageCommandDefinition[];
  logger: Logger;
}

function buildContextMenu(
  command: ContextMenuRegistrationOptions & { readonly name: string },
  type: ApplicationCommandType.User | ApplicationCommandType.Message,
): RESTPostAPIApplicationCommandsJSONBody {
  const builder = new ContextMenuCommandBuilder().setName(command.name).setType(type);
  if (command.defaultMemberPermissions !== undefined) {
    builder.setDefaultMemberPermissions(
      command.defaultMemberPermissions === null
        ? null
        : PermissionsBitField.resolve(command.defaultMemberPermissions),
    );
  }
  if (command.contexts !== undefined) builder.setContexts(...command.contexts);
  if (command.integrationTypes !== undefined)
    builder.setIntegrationTypes(...command.integrationTypes);
  if (command.nameLocalizations !== undefined)
    builder.setNameLocalizations(command.nameLocalizations);
  return builder.toJSON();
}

/**
 * Bulk-replaces the application's registered commands with the current
 * registry contents. No diffing — a full `PUT` is what Discord's own API
 * expects for this operation, and it's deterministic: the registered set
 * always matches exactly what's loaded, with nothing stale left behind.
 */
export async function registerCommands(options: RegisterCommandsOptions): Promise<void> {
  const body: RESTPostAPIApplicationCommandsJSONBody[] = [
    ...options.commands.map((command) => command.builder.toJSON()),
    ...(options.userContextMenuCommands ?? []).map((command) =>
      buildContextMenu(command, ApplicationCommandType.User),
    ),
    ...(options.messageContextMenuCommands ?? []).map((command) =>
      buildContextMenu(command, ApplicationCommandType.Message),
    ),
  ];

  const scope = options.guildId ? 'guild' : 'global';
  const route = options.guildId
    ? Routes.applicationGuildCommands(options.clientId, options.guildId)
    : Routes.applicationCommands(options.clientId);

  try {
    await options.rest.put(route, { body });
    options.logger.info(`Registered ${body.length} ${scope} command(s)`, {
      scope,
      guildId: options.guildId,
      commands: body.map((command) => command.name),
    });
  } catch (error) {
    throw new CommandError('Command registration with Discord failed', {
      cause: error,
      metadata: {
        reason: 'registration-failed',
        scope,
        guildId: options.guildId,
        count: body.length,
      },
    });
  }
}
