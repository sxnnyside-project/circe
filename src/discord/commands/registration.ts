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
 * Minimal contract required from a Discord REST client to deploy application commands.
 *
 * @public
 */
export interface CommandRest {
  /**
   * Performs an HTTP PUT request to Discord REST API.
   *
   * @param route - The target Discord API route.
   * @param options - Request options payload.
   */
  put(route: string, options: { body: unknown }): Promise<unknown>;
}

/**
 * Options accepted by {@link registerCommands}.
 *
 * @public
 */
export interface RegisterCommandsOptions {
  /** REST client implementation used for command registration. */
  rest: CommandRest;
  /** Application Client ID from the Discord Developer Portal. */
  clientId: string;
  /** Target guild ID for instant dev/staging registration; omitted for global production rollout. */
  guildId?: string;
  /** Array of slash commands to deploy. */
  commands: readonly CommandDefinition[];
  /** Array of user context menu commands to include in bulk deploy. */
  userContextMenuCommands?: readonly UserCommandDefinition[];
  /** Array of message context menu commands to include in bulk deploy. */
  messageContextMenuCommands?: readonly MessageCommandDefinition[];
  /** Logger instance for registration diagnostics. */
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
 * Bulk-registers all slash commands and context menu commands with Discord via a single HTTP `PUT`.
 *
 * @remarks
 * Overwrites Discord's command list with the exact loaded registry contents, guaranteeing
 * deterministic deployments with zero stale or ghost commands left behind.
 *
 * @param options - Registration settings, commands list, and REST client.
 * @throws {@link CommandError} If Discord rejects the registration payload.
 *
 * @public
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
