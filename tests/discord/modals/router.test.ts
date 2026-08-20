import { describe, expect, test } from "bun:test";
import { GuildMember } from "discord.js";
import { ModalError } from "../../../src/discord/modals/errors.js";
import { ModalRegistry } from "../../../src/discord/modals/registry.js";
import { handleModalInteraction } from "../../../src/discord/modals/router.js";
import type { ModalContext } from "../../../src/discord/modals/types.js";
import { getCorrelationId } from "../../../src/logging/context.js";
import { createLogger, type LogEntry } from "../../../src/logging/logger.js";

/** A minimal stand-in for a discord.js `ModalSubmitInteraction`. Only the surface `handleModalInteraction` actually touches is implemented. */
function makeInteraction(customId: string, fields: Record<string, string> = {}) {
  const replies: { content: string; ephemeral?: boolean }[] = [];
  const followUps: { content: string; ephemeral?: boolean }[] = [];

  const interaction = {
    customId,
    deferred: false,
    replied: false,
    guild: { id: "guild-1" } as never,
    member: null,
    user: { id: "user-1", username: "tester" },
    client: {} as never,
    fields: {
      getTextInputValue: (id: string) => fields[id] ?? "",
    },
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

describe("handleModalInteraction", () => {
  test("replies with a fallback message when no prefix matches", async () => {
    const registry = new ModalRegistry();
    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("unknown:123");

    await handleModalInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.ephemeral).toBe(true);
  });

  test("routes a modal submission to its handler by prefix and reads field values", async () => {
    const registry = new ModalRegistry();
    let received: string | undefined;
    registry.register({
      prefix: "curate:submit:",
      execute: (ctx) => {
        received = ctx.interaction.fields.getTextInputValue("review");
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("curate:submit:track-1", { review: "great track" });

    await handleModalInteraction(interaction as never, { registry, logger });

    expect(received).toBe("great track");
  });

  test("a modal handler that throws is caught by the central error boundary and replies safely", async () => {
    const registry = new ModalRegistry();
    registry.register({
      prefix: "curate:submit:",
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger, entries } = silentLogger();
    const { interaction, replies } = makeInteraction("curate:submit:1");

    await handleModalInteraction(interaction as never, { registry, logger });

    expect(replies).toHaveLength(1);
    expect(entries.some((entry) => entry.level === "error")).toBe(true);
  });

  test("regression: an execution failure is logged as a ModalError, not a generic CirceError", async () => {
    const registry = new ModalRegistry();
    registry.register({
      prefix: "curate:submit:",
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger, entries } = silentLogger();
    const { interaction } = makeInteraction("curate:submit:1");

    await handleModalInteraction(interaction as never, { registry, logger });

    const errorEntry = entries.find((entry) => entry.level === "error");
    expect(errorEntry?.metadata.error).toBeInstanceOf(ModalError);
  });

  test("onUnknownModal overrides the default unregistered-modal reply", async () => {
    const registry = new ModalRegistry();
    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("unknown:1");

    let called = false;
    await handleModalInteraction(interaction as never, {
      registry,
      logger,
      onUnknownModal: (ctx) => {
        called = true;
        expect(ctx.interaction.customId).toBe("unknown:1");
      },
    });

    expect(called).toBe(true);
    expect(replies).toHaveLength(0);
  });

  test("onModalError overrides the default error reply and receives a ModalError", async () => {
    const registry = new ModalRegistry();
    registry.register({
      prefix: "curate:submit:",
      execute: () => {
        throw new Error("boom");
      },
    });

    const { logger } = silentLogger();
    const { interaction, replies } = makeInteraction("curate:submit:1");

    let receivedError: ModalError | undefined;
    await handleModalInteraction(interaction as never, {
      registry,
      logger,
      onModalError: (_ctx, error) => {
        receivedError = error;
      },
    });

    expect(receivedError).toBeInstanceOf(ModalError);
    expect(replies).toHaveLength(0);
  });

  test("establishes a fresh correlation ID for each invocation and attaches it to the context", async () => {
    const registry = new ModalRegistry();
    const seenIds: (string | undefined)[] = [];

    registry.register({
      prefix: "curate:submit:",
      execute: (ctx: ModalContext) => {
        seenIds.push(ctx.correlationId);
        expect(ctx.correlationId).toBe(getCorrelationId());
      },
    });

    const { logger } = silentLogger();

    await handleModalInteraction(makeInteraction("curate:submit:1").interaction as never, { registry, logger });
    await handleModalInteraction(makeInteraction("curate:submit:2").interaction as never, { registry, logger });

    expect(seenIds).toHaveLength(2);
    expect(seenIds[0]).toBeDefined();
    expect(seenIds[0]).not.toBe(seenIds[1]);
  });

  test("normalizes ctx.member to null when the interaction did not resolve a cached GuildMember", async () => {
    const registry = new ModalRegistry();
    registry.register({
      prefix: "curate:submit:",
      execute: (ctx: ModalContext) => {
        expect(ctx.member).toBeNull();
        expect(ctx.member instanceof GuildMember).toBe(false);
      },
    });

    const { logger } = silentLogger();
    const { interaction } = makeInteraction("curate:submit:1");

    await handleModalInteraction(interaction as never, { registry, logger });
  });
});
