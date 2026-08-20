import { describe, expect, test } from "bun:test";
import { GuildMember } from "discord.js";
import { ComponentError } from "../../../src/discord/components/errors.js";
import { ComponentRegistry } from "../../../src/discord/components/registry.js";
import { handleComponentInteraction } from "../../../src/discord/components/router.js";
import type { ComponentContext } from "../../../src/discord/components/types.js";
import { getCorrelationId } from "../../../src/logging/context.js";
import { createLogger, type LogEntry } from "../../../src/logging/logger.js";

/**
 * A minimal stand-in for a discord.js `ButtonInteraction`/`StringSelectMenuInteraction`.
 * Only the surface `handleComponentInteraction` actually touches is implemented.
 */
function makeInteraction(customId: string, options: { guild?: boolean } = {}) {
  const replies: { content: string; ephemeral?: boolean }[] = [];
  const followUps: { content: string; ephemeral?: boolean }[] = [];

  const interaction = {
    customId,
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

describe("handleComponentInteraction", () => {
  test("replies with a fallback message when no prefix matches", async () => {
    const registry = new ComponentRegistry();
    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("unknown:123");

    await handleComponentInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.ephemeral).toBe(true);
  });

  test("routes a button-style customId to its handler (prefix match)", async () => {
    const registry = new ComponentRegistry();
    let executed = false;
    registry.register({
      prefix: "crate:save:",
      execute: (ctx) => {
        executed = true;
        expect(ctx.interaction.customId).toBe("crate:save:123");
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("crate:save:123");

    await handleComponentInteraction(interaction as never, { registry, logger });

    expect(executed).toBe(true);
  });

  test("routes a select-menu-style customId to its handler (same router, same resolution)", async () => {
    const registry = new ComponentRegistry();
    let executed = false;
    registry.register({
      prefix: "discover:style:",
      execute: () => {
        executed = true;
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("discover:style:select");

    await handleComponentInteraction(interaction as never, { registry, logger });

    expect(executed).toBe(true);
  });

  test("a component that throws is caught by the central error boundary and replies safely", async () => {
    const registry = new ComponentRegistry();
    registry.register({
      prefix: "crate:save:",
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger, entries } = silentLogger();
    const { interaction, replies } = makeInteraction("crate:save:1");

    await handleComponentInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(1);
    expect(entries.some((entry) => entry.level === "error")).toBe(true);
  });

  test("regression: an execution failure is logged as a ComponentError, not a generic CirceError", async () => {
    const registry = new ComponentRegistry();
    registry.register({
      prefix: "crate:save:",
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger, entries } = silentLogger();
    const { interaction } = makeInteraction("crate:save:1");

    await handleComponentInteraction(interaction as never, { registry, logger });

    const errorEntry = entries.find((entry) => entry.level === "error");
    expect(errorEntry?.metadata.error).toBeInstanceOf(ComponentError);
  });

  test("onUnknownComponent overrides the default unregistered-component reply", async () => {
    const registry = new ComponentRegistry();
    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("unknown:1");

    let called = false;
    await handleComponentInteraction(interaction as never, {
      registry,
      logger,
      onUnknownComponent: (ctx) => {
        called = true;
        expect(ctx.interaction.customId).toBe("unknown:1");
      },
    });

    expect(called).toBe(true);
    expect(replies).toHaveLength(0);
  });

  test("onComponentError overrides the default error reply and receives a ComponentError", async () => {
    const registry = new ComponentRegistry();
    registry.register({
      prefix: "crate:save:",
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("crate:save:1");

    let receivedError: ComponentError | undefined;
    await handleComponentInteraction(interaction as never, {
      registry,
      logger,
      onComponentError: (_ctx, error) => {
        receivedError = error;
      },
    });

    expect(receivedError).toBeInstanceOf(ComponentError);
    expect(replies).toHaveLength(0);
  });

  test("establishes a fresh correlation ID for each invocation and attaches it to the context", async () => {
    const registry = new ComponentRegistry();
    const seenIds: (string | undefined)[] = [];

    registry.register({
      prefix: "crate:save:",
      execute: (ctx: ComponentContext) => {
        seenIds.push(ctx.correlationId);
        expect(ctx.correlationId).toBe(getCorrelationId());
      },
    });

    const { logger } = silentLogger();

    await handleComponentInteraction(makeInteraction("crate:save:1").interaction as never, { registry, logger });
    await handleComponentInteraction(makeInteraction("crate:save:2").interaction as never, { registry, logger });

    expect(seenIds).toHaveLength(2);
    expect(seenIds[0]).toBeDefined();
    expect(seenIds[0]).not.toBe(seenIds[1]);
  });

  test("normalizes ctx.member to null when the interaction did not resolve a cached GuildMember", async () => {
    const registry = new ComponentRegistry();
    registry.register({
      prefix: "crate:save:",
      execute: (ctx: ComponentContext) => {
        expect(ctx.member).toBeNull();
        expect(ctx.member instanceof GuildMember).toBe(false);
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("crate:save:1");

    await handleComponentInteraction(interaction as never, { registry, logger });
  });

  test("ctx.params is undefined when the handler defines no parse()", async () => {
    const registry = new ComponentRegistry();
    let seen: unknown;
    registry.register({
      prefix: "crate:save:",
      execute: (ctx) => {
        seen = ctx.params;
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("crate:save:1");

    await handleComponentInteraction(interaction as never, { registry, logger });
    expect(seen).toBeUndefined();
  });

  test("ctx.params holds parse()'s return value, computed from the full customId", async () => {
    const registry = new ComponentRegistry();
    let seen: { source: string; sourceId: string } | undefined;
    registry.register({
      prefix: "crate:save:",
      parse: (customId) => {
        const [source, sourceId] = customId.slice("crate:save:".length).split(":");
        return { source: source ?? "", sourceId: sourceId ?? "" };
      },
      execute: (ctx) => {
        seen = ctx.params;
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("crate:save:spotify:abc123");

    await handleComponentInteraction(interaction as never, { registry, logger });
    expect(seen).toEqual({ source: "spotify", sourceId: "abc123" });
  });

  test("a parse() that throws is caught by the same error boundary as execute()", async () => {
    const registry = new ComponentRegistry();
    registry.register({
      prefix: "crate:save:",
      parse: () => {
        throw new Error("malformed customId");
      },
      execute: () => {
        throw new Error("should never run");
      },
    });

    const { logger, entries } = silentLogger();
    const { interaction, replies } = makeInteraction("crate:save:garbage");

    await handleComponentInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(1);
    expect(entries.some((entry) => entry.level === "error")).toBe(true);
  });
});
