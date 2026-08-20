import { describe, expect, test } from "bun:test";
import { SlashCommandBuilder } from "discord.js";
import { CommandError } from "../../../src/discord/commands/errors.js";
import { type CommandRest, registerCommands } from "../../../src/discord/commands/registration.js";
import type { CommandDefinition } from "../../../src/discord/commands/types.js";
import { createLogger } from "../../../src/logging/logger.js";

function makeCommand(name: string): CommandDefinition {
  return {
    builder: new SlashCommandBuilder().setName(name).setDescription("test"),
    execute: async () => {},
  };
}

const logger = createLogger({ sink: () => {} });

describe("registerCommands", () => {
  test("PUTs to the global route when no guildId is configured", async () => {
    const calls: { route: string; body: unknown }[] = [];
    const rest: CommandRest = {
      put: async (route, options) => {
        calls.push({ route, body: options.body });
        return [];
      },
    };

    await registerCommands({ rest, clientId: "app-1", commands: [makeCommand("ping")], logger });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.route).toBe("/applications/app-1/commands");
    const body = calls[0]?.body as unknown[] | undefined;
    expect(body?.length).toBe(1);
  });

  test("PUTs to the guild-scoped route when guildId is configured (dev/staging)", async () => {
    const calls: { route: string }[] = [];
    const rest: CommandRest = {
      put: async (route) => {
        calls.push({ route });
        return [];
      },
    };

    await registerCommands({ rest, clientId: "app-1", guildId: "guild-1", commands: [makeCommand("ping")], logger });

    expect(calls[0]?.route).toBe("/applications/app-1/guilds/guild-1/commands");
  });

  test("serializes every registered command's builder", async () => {
    let body: unknown;
    const rest: CommandRest = {
      put: async (_route, options) => {
        body = options.body;
        return [];
      },
    };

    await registerCommands({
      rest,
      clientId: "app-1",
      commands: [makeCommand("ping"), makeCommand("pong")],
      logger,
    });

    const names = (body as { name: string }[]).map((command) => command.name).sort();
    expect(names).toEqual(["ping", "pong"]);
  });

  test("wraps a REST failure in CommandError, preserving the cause", async () => {
    const causeError = new Error("Discord said no");
    const rest: CommandRest = {
      put: async () => {
        throw causeError;
      },
    };

    await expect(registerCommands({ rest, clientId: "app-1", commands: [], logger })).rejects.toBeInstanceOf(
      CommandError,
    );

    try {
      await registerCommands({ rest, clientId: "app-1", commands: [], logger });
      throw new Error("expected registerCommands to throw");
    } catch (error) {
      expect((error as CommandError).cause).toBe(causeError);
    }
  });
});
