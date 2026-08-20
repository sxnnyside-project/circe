import { describe, expect, test } from "bun:test";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../src/discord/commands/types.js";
import { hasPermission } from "../../src/discord/guards/permissions.js";
import type { ModalContext } from "../../src/discord/modals/types.js";
import { testCommand } from "../../src/testing/command.js";
import { createTestContext } from "../../src/testing/context.js";
import { testEvent } from "../../src/testing/event.js";
import { createTestInteraction, createTestModalInteraction } from "../../src/testing/interaction.js";
import { createTestLogger } from "../../src/testing/logger.js";
import { testModal } from "../../src/testing/modal.js";

describe("createTestInteraction", () => {
  test("defaults to a guild interaction with a null member", () => {
    const { interaction } = createTestInteraction();
    expect(interaction.guild).toBeDefined();
    expect(interaction.member).toBeNull();
  });

  test("supports simulating a DM (no guild) interaction", () => {
    const { interaction } = createTestInteraction({ guild: null });
    expect(interaction.guild).toBeNull();
  });

  test("records reply() calls", async () => {
    const { interaction, replies } = createTestInteraction();
    await interaction.reply({ content: "hi", ephemeral: true });
    expect(replies).toEqual([{ content: "hi", ephemeral: true }]);
    expect(interaction.replied).toBe(true);
  });

  test("records followUp() calls separately from replies", async () => {
    const { interaction, replies, followUps } = createTestInteraction();
    await interaction.followUp({ content: "more" });
    expect(replies).toHaveLength(0);
    expect(followUps).toEqual([{ content: "more" }]);
  });
});

describe("createTestContext", () => {
  test("builds a usable CommandContext for direct execute() testing", async () => {
    let received: unknown;
    const command = {
      builder: new SlashCommandBuilder().setName("echo").setDescription("echo"),
      execute: (ctx: ReturnType<typeof createTestContext>) => {
        received = ctx.user.id;
      },
    };

    await command.execute(createTestContext());
    expect(received).toBe("test-user");
  });

  test("threads a supplied correlationId through to the context", () => {
    const ctx = createTestContext({ correlationId: "fixed-id" });
    expect(ctx.correlationId).toBe("fixed-id");
  });
});

describe("createTestLogger", () => {
  test("collects entries instead of writing them anywhere", () => {
    const { logger, entries } = createTestLogger();
    logger.info("hello", { foo: "bar" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe("hello");
  });
});

describe("testCommand", () => {
  test("runs a passing command through the real router and captures its reply", async () => {
    const command = {
      builder: new SlashCommandBuilder().setName("ping").setDescription("ping"),
      execute: async (ctx: CommandContext) => {
        await ctx.interaction.reply({ content: "pong" });
      },
    };

    const result = await testCommand(command);
    expect(result.replies).toEqual([{ content: "pong" }]);
  });

  test("a guard denial is reflected in the reply and execute() never runs", async () => {
    let executed = false;
    const command = {
      builder: new SlashCommandBuilder().setName("ban").setDescription("ban"),
      guards: [hasPermission(PermissionFlagsBits.BanMembers)],
      execute: () => {
        executed = true;
      },
    };

    const result = await testCommand(command, { guild: null });
    expect(executed).toBe(false);
    expect(result.replies[0]?.content).toContain("server");
  });

  test("an execution error is caught and logged, not thrown out of testCommand", async () => {
    const command = {
      builder: new SlashCommandBuilder().setName("broken").setDescription("broken"),
      execute: () => {
        throw new Error("boom");
      },
    };

    const result = await testCommand(command);
    expect(result.replies).toHaveLength(1);
    expect(result.logs.some((entry) => entry.level === "error")).toBe(true);
  });
});

describe("createTestModalInteraction", () => {
  test("builds an interaction with the given customId and readable field values", () => {
    const { interaction } = createTestModalInteraction({
      customId: "curate:submit:track-1",
      fields: { rating: "8" },
    });

    expect(interaction.customId).toBe("curate:submit:track-1");
    expect(interaction.fields.getTextInputValue("rating")).toBe("8");
  });

  test("throws when a field has no test value provided, rather than silently returning empty", () => {
    const { interaction } = createTestModalInteraction();
    expect(() => interaction.fields.getTextInputValue("missing")).toThrow();
  });
});

describe("testModal", () => {
  test("runs a passing modal through the real router and captures its reply", async () => {
    const modal = {
      prefix: "curate:submit:",
      execute: async (ctx: ModalContext) => {
        await ctx.interaction.reply({ content: "curated" });
      },
    };

    const result = await testModal(modal);
    expect(result.replies).toEqual([{ content: "curated" }]);
  });

  test("field values are readable through the fabricated interaction", async () => {
    const modal = {
      prefix: "curate:submit:",
      execute: async (ctx: ModalContext) => {
        const review = ctx.interaction.fields.getTextInputValue("review");
        await ctx.interaction.reply({ content: review });
      },
    };

    const result = await testModal(modal, { fields: { review: "great track" } });
    expect(result.replies).toEqual([{ content: "great track" }]);
  });

  test("an execution error is caught and logged, not thrown out of testModal", async () => {
    const modal = {
      prefix: "curate:submit:",
      execute: () => {
        throw new Error("boom");
      },
    };

    const result = await testModal(modal);
    expect(result.replies).toHaveLength(1);
    expect(result.logs.some((entry) => entry.level === "error")).toBe(true);
  });
});

describe("testEvent", () => {
  test("invokes the event and returns logs (success case: no error entries)", async () => {
    let called = false;
    const result = await testEvent(
      {
        name: "guildCreate",
        execute: () => {
          called = true;
        },
      },
      {} as never,
    );

    expect(called).toBe(true);
    expect(result.logs.some((entry) => entry.level === "error")).toBe(false);
  });

  test("a throwing handler is isolated: the failure shows up as a log entry", async () => {
    const result = await testEvent(
      {
        name: "guildCreate",
        execute: () => {
          throw new Error("listener failed");
        },
      },
      {} as never,
    );

    expect(result.logs.some((entry) => entry.level === "error")).toBe(true);
  });
});
