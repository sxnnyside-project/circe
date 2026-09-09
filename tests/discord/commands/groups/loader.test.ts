import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { CommandError } from "../../../../src/discord/commands/errors.js";
import { loadCommandGroups } from "../../../../src/discord/commands/groups/loader.js";
import { CommandRegistry } from "../../../../src/discord/commands/registry.js";
import type { CommandContext } from "../../../../src/discord/commands/types.js";
import { createLogger } from "../../../../src/logging/logger.js";

// Subcommand fixtures import a real `SlashCommandSubcommandBuilder` from
// discord.js — the group loader asserts a real builder instance, not a
// plain object shaped like one. The temp dir has to live under the
// project root (not the OS tmpdir) so Node/Bun module resolution walks up
// to this package's own `node_modules` and finds discord.js.
const TEMP_ROOT = path.join(import.meta.dirname, "..", "..", "..", "..", ".tmp-test-groups");

async function withTempDir(files: Record<string, string>, fn: (dir: string) => Promise<void>): Promise<void> {
  await mkdir(TEMP_ROOT, { recursive: true });
  const dir = await mkdtemp(path.join(TEMP_ROOT, "run-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const fullPath = path.join(dir, name);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    }
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const logger = createLogger({ sink: () => {} });

const GROUP_CONFIG = `
export default { name: "config", description: "Server configuration" };
`;

const SUBGROUP_ROLES = `
export default { name: "roles", description: "Manage roles" };
`;

function subcommandModule(name: string): string {
  return `
import { SlashCommandSubcommandBuilder } from "discord.js";
export default {
  builder: new SlashCommandSubcommandBuilder().setName("${name}").setDescription("${name}"),
  execute: async (ctx) => { ctx.interaction.reply("${name} ran"); },
};
`;
}

function fakeCommandContext(subgroupName: string | null, subcommandName: string | null): CommandContext {
  const replies: string[] = [];
  return {
    interaction: {
      commandName: "config",
      options: {
        getSubcommandGroup: () => subgroupName,
        getSubcommand: () => subcommandName,
      },
      reply: async (content: string) => {
        replies.push(content);
      },
    },
    client: undefined,
    guild: null,
    member: null,
    user: { id: "user-1" },
    logger,
    correlationId: undefined,
    // biome-ignore lint/suspicious/noExplicitAny: minimal interaction stub, only the fields execute() reads
  } as any;
}

describe("loadCommandGroups", () => {
  test("assembles a group with a direct subcommand into one registered command", async () => {
    await withTempDir(
      {
        "config/_group.ts": GROUP_CONFIG,
        "config/sync.ts": subcommandModule("sync"),
      },
      async (dir) => {
        const registry = new CommandRegistry();
        await loadCommandGroups(dir, { registry, logger });

        expect(registry.size).toBe(1);
        const command = registry.get("config");
        expect(command?.builder.name).toBe("config");

        const ctx = fakeCommandContext(null, "sync");
        await command?.execute(ctx);
        expect((ctx.interaction as { reply: (c: string) => void }).reply).toBeDefined();
      },
    );
  });

  test("routes a two-level group/subgroup/subcommand tree to the correct leaf", async () => {
    await withTempDir(
      {
        "config/_group.ts": GROUP_CONFIG,
        "config/roles/_group.ts": SUBGROUP_ROLES,
        "config/roles/add.ts": subcommandModule("add"),
        "config/roles/remove.ts": subcommandModule("remove"),
      },
      async (dir) => {
        const registry = new CommandRegistry();
        await loadCommandGroups(dir, { registry, logger });

        expect(registry.size).toBe(1);
        const command = registry.get("config");

        const replies: string[] = [];
        const ctx = {
          interaction: {
            commandName: "config",
            options: { getSubcommandGroup: () => "roles", getSubcommand: () => "add" },
            reply: async (content: string) => {
              replies.push(content);
            },
          },
          logger,
          // biome-ignore lint/suspicious/noExplicitAny: minimal interaction stub
        } as any;

        await command?.execute(ctx);
        expect(replies).toEqual(["add ran"]);
      },
    );
  });

  test("carries the group's guards onto the assembled command", async () => {
    await withTempDir(
      {
        "config/_group.ts": `
          export default {
            name: "config",
            description: "Server configuration",
            guards: [() => "denied by group guard"],
          };
        `,
        "config/sync.ts": subcommandModule("sync"),
      },
      async (dir) => {
        const registry = new CommandRegistry();
        await loadCommandGroups(dir, { registry, logger });

        const command = registry.get("config");
        expect(command?.guards).toHaveLength(1);
        expect(await command?.guards?.[0]?.(fakeCommandContext(null, "sync"))).toBe("denied by group guard");
      },
    );
  });

  test("throws CommandError when a group folder is missing _group.ts", async () => {
    await withTempDir({ "config/sync.ts": subcommandModule("sync") }, async (dir) => {
      const registry = new CommandRegistry();
      try {
        await loadCommandGroups(dir, { registry, logger });
        throw new Error("expected loadCommandGroups to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        expect((error as CommandError).message).toContain("missing a _group.ts file");
      }
    });
  });

  test("throws CommandError when a subgroup folder is missing _group.ts", async () => {
    await withTempDir(
      {
        "config/_group.ts": GROUP_CONFIG,
        "config/roles/add.ts": subcommandModule("add"),
      },
      async (dir) => {
        const registry = new CommandRegistry();
        try {
          await loadCommandGroups(dir, { registry, logger });
          throw new Error("expected loadCommandGroups to throw");
        } catch (error) {
          expect(error).toBeInstanceOf(CommandError);
          expect((error as CommandError).message).toContain("missing a _group.ts file");
        }
      },
    );
  });

  test("throws CommandError when a subcommand file is malformed", async () => {
    await withTempDir(
      {
        "config/_group.ts": GROUP_CONFIG,
        "config/sync.ts": "export default { builder: {} };",
      },
      async (dir) => {
        const registry = new CommandRegistry();
        try {
          await loadCommandGroups(dir, { registry, logger });
          throw new Error("expected loadCommandGroups to throw");
        } catch (error) {
          expect(error).toBeInstanceOf(CommandError);
          expect((error as CommandError).message).toContain("does not export a valid default subcommand definition");
        }
      },
    );
  });

  test("throws CommandError when nesting exceeds two levels", async () => {
    await withTempDir(
      {
        "config/_group.ts": GROUP_CONFIG,
        "config/roles/_group.ts": SUBGROUP_ROLES,
        "config/roles/too-deep/add.ts": subcommandModule("add"),
      },
      async (dir) => {
        const registry = new CommandRegistry();
        try {
          await loadCommandGroups(dir, { registry, logger });
          throw new Error("expected loadCommandGroups to throw");
        } catch (error) {
          expect(error).toBeInstanceOf(CommandError);
          expect((error as CommandError).message).toContain("exceeds the maximum command-group nesting depth");
        }
      },
    );
  });

  test("assembled execute throws CommandError for an unrecognized subcommand key", async () => {
    await withTempDir({ "config/_group.ts": GROUP_CONFIG, "config/sync.ts": subcommandModule("sync") }, async (dir) => {
      const registry = new CommandRegistry();
      await loadCommandGroups(dir, { registry, logger });
      const command = registry.get("config");

      await expect(command?.execute(fakeCommandContext(null, "does-not-exist"))).rejects.toBeInstanceOf(CommandError);
    });
  });

  test("assembled execute throws CommandError when the interaction has no subcommand at all", async () => {
    await withTempDir({ "config/_group.ts": GROUP_CONFIG, "config/sync.ts": subcommandModule("sync") }, async (dir) => {
      const registry = new CommandRegistry();
      await loadCommandGroups(dir, { registry, logger });
      const command = registry.get("config");

      await expect(command?.execute(fakeCommandContext(null, null))).rejects.toBeInstanceOf(CommandError);
    });
  });
});
