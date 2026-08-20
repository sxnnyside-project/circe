import { type RESTPostAPIChatInputApplicationCommandsJSONBody, Routes } from "discord.js";
import type { Logger } from "../../logging/logger.js";
import { CommandError } from "./errors.js";
import type { CommandDefinition } from "./types.js";

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
  logger: Logger;
}

/**
 * Bulk-replaces the application's registered commands with the current
 * registry contents. No diffing — a full `PUT` is what Discord's own API
 * expects for this operation, and it's deterministic: the registered set
 * always matches exactly what's loaded, with nothing stale left behind.
 */
export async function registerCommands(options: RegisterCommandsOptions): Promise<void> {
  const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = options.commands.map((command) =>
    command.builder.toJSON(),
  );

  const scope = options.guildId ? "guild" : "global";
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
    throw new CommandError("Command registration with Discord failed", {
      cause: error,
      metadata: { reason: "registration-failed", scope, guildId: options.guildId, count: body.length },
    });
  }
}
