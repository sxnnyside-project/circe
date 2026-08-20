import { describe, expect, test } from "bun:test";
import { GuildMember, SlashCommandBuilder } from "discord.js";
import { CommandError } from "../../../src/discord/commands/errors.js";
import { CommandRegistry } from "../../../src/discord/commands/registry.js";
import { handleCommandInteraction } from "../../../src/discord/commands/router.js";
import type { CommandContext, Guard } from "../../../src/discord/commands/types.js";
import { getCorrelationId } from "../../../src/logging/context.js";
import { createLogger, type LogEntry } from "../../../src/logging/logger.js";

/**
 * A minimal stand-in for a discord.js `ChatInputCommandInteraction`. Only
 * the surface `handleCommandInteraction` actually touches is implemented —
 * this is a hand-built test stub scoped to this one test file, not the
 * reusable fixture builder exposed by `circe/testing`.
 */
function makeInteraction(commandName: string, options: { guild?: boolean } = {}) {
  const replies: { content: string; ephemeral?: boolean }[] = [];
  const followUps: { content: string; ephemeral?: boolean }[] = [];

  const interaction = {
    commandName,
    deferred: false,
    replied: false,
    guild: options.guild === false ? null : ({ id: "guild-1" } as never),
    member: null,
    user: { id: "user-1", username: "tester" },
    client: {} as never,
    reply: async (payload: { content: string; ephemeral?: boolean }) => {
      interaction.replied = true;
      replies.push(payload);
    },
    followUp: async (payload: { content: string; ephemeral?: boolean }) => {
      followUps.push(payload);
    },
  };

  return { interaction, replies, followUps };
}

function silentLogger(): { logger: ReturnType<typeof createLogger>; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

describe("handleCommandInteraction", () => {
  test("replies with a fallback message for an unregistered command", async () => {
    const registry = new CommandRegistry();
    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("missing");

    await handleCommandInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.ephemeral).toBe(true);
  });

  test("executes the resolved command", async () => {
    const registry = new CommandRegistry();
    let executed = false;
    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: (ctx) => {
        executed = true;
        expect(ctx.interaction.commandName).toBe("ping");
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("ping");

    await handleCommandInteraction(interaction as never, { registry, logger });

    expect(executed).toBe(true);
  });

  test("a passing guard allows execution", async () => {
    const registry = new CommandRegistry();
    let executed = false;
    const allow: Guard = () => true;

    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      guards: [allow],
      execute: () => {
        executed = true;
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("ping");

    await handleCommandInteraction(interaction as never, { registry, logger });

    expect(executed).toBe(true);
  });

  test("a failing guard blocks execution and replies with the denial reason", async () => {
    const registry = new CommandRegistry();
    let executed = false;
    const deny: Guard = () => "not allowed";

    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      guards: [deny],
      execute: () => {
        executed = true;
      },
    });

    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("ping");

    await handleCommandInteraction(interaction as never, { registry, logger });

    expect(executed).toBe(false);
    expect(replies[0]?.content).toBe("not allowed");
  });

  test("guards run in order and a later guard does not run once an earlier one denies", async () => {
    const registry = new CommandRegistry();
    const calls: string[] = [];
    const first: Guard = () => {
      calls.push("first");
      return "denied by first";
    };
    const second: Guard = () => {
      calls.push("second");
      return true;
    };

    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      guards: [first, second],
      execute: () => {},
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("ping");

    await handleCommandInteraction(interaction as never, { registry, logger });

    expect(calls).toEqual(["first"]);
  });

  test("a command that throws is caught by the central error boundary and replies safely", async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger, entries } = silentLogger();
    const { interaction, replies } = makeInteraction("ping");

    await handleCommandInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(1);
    expect(entries.some((entry) => entry.level === "error")).toBe(true);
  });

  test("regression: an execution failure is logged as a CommandError, not a generic CirceError", async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger, entries } = silentLogger();
    const { interaction } = makeInteraction("ping");

    await handleCommandInteraction(interaction as never, { registry, logger });

    const errorEntry = entries.find((entry) => entry.level === "error");
    expect(errorEntry?.metadata.error).toBeInstanceOf(CommandError);
  });

  test("follows up instead of replying when the interaction was already replied to", async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: () => {
        throw new Error("boom after reply");
      },
    });

    const { logger } = silentLogger();
    const { interaction, replies, followUps } = makeInteraction("ping");
    interaction.replied = true;

    await handleCommandInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(0);
    expect(followUps).toHaveLength(1);
  });

  test("establishes a fresh correlation ID for each invocation and attaches it to the context", async () => {
    const registry = new CommandRegistry();
    const seenIds: (string | undefined)[] = [];

    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: (ctx: CommandContext) => {
        seenIds.push(ctx.correlationId);
        expect(ctx.correlationId).toBe(getCorrelationId());
      },
    });

    const { logger } = silentLogger();

    await handleCommandInteraction(makeInteraction("ping").interaction as never, { registry, logger });
    await handleCommandInteraction(makeInteraction("ping").interaction as never, { registry, logger });

    expect(seenIds).toHaveLength(2);
    expect(seenIds[0]).toBeDefined();
    expect(seenIds[1]).toBeDefined();
    expect(seenIds[0]).not.toBe(seenIds[1]);
  });

  test("normalizes ctx.member to null when the interaction did not resolve a cached GuildMember", async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: (ctx: CommandContext) => {
        expect(ctx.member).toBeNull();
        expect(ctx.member instanceof GuildMember).toBe(false);
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("ping");

    await handleCommandInteraction(interaction as never, { registry, logger });
  });

  test("regression: onUnknownCommand overrides the default unregistered-command reply", async () => {
    const registry = new CommandRegistry();
    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("missing");

    let called = false;
    await handleCommandInteraction(interaction as never, {
      registry,
      logger,
      onUnknownCommand: (ctx) => {
        called = true;
        expect(ctx.interaction.commandName).toBe("missing");
      },
    });

    expect(called).toBe(true);
    expect(replies).toHaveLength(0); // the default reply never ran
  });

  test("regression: onGuardDenied overrides the default denial reply and receives the guard's reason", async () => {
    const registry = new CommandRegistry();
    const deny: Guard = () => "denied";
    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      guards: [deny],
      execute: () => {},
    });

    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("ping");

    let receivedReason: string | undefined;
    await handleCommandInteraction(interaction as never, {
      registry,
      logger,
      onGuardDenied: (_ctx, reason) => {
        receivedReason = reason;
      },
    });

    expect(receivedReason).toBe("denied");
    expect(replies).toHaveLength(0);
  });

  test("regression: onCommandError overrides the default error reply and receives a CommandError", async () => {
    const registry = new CommandRegistry();
    registry.register({
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("ping");

    let receivedError: CommandError | undefined;
    await handleCommandInteraction(interaction as never, {
      registry,
      logger,
      onCommandError: (_ctx, error) => {
        receivedError = error;
      },
    });

    expect(receivedError).toBeInstanceOf(CommandError);
    expect(replies).toHaveLength(0);
  });
});
