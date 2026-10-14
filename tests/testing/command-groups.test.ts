import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCommandGroups } from '../../src/discord/commands/groups/loader.js';
import { CommandRegistry } from '../../src/discord/commands/registry.js';
import { createLogger } from '../../src/logging/logger.js';
import { testCommand } from '../../src/testing/command.js';

// Subcommand fixtures import a real `SlashCommandSubcommandBuilder` from
// discord.js — the temp dir has to live under the project root so Node/Bun
// module resolution walks up to this package's own `node_modules`.
const TEMP_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-testing-groups');

// Removes the (empty) root once the file's runs are done, so a test run leaves nothing behind.
afterAll(() => rm(TEMP_ROOT, { recursive: true, force: true }));

async function withTempDir(
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  await mkdir(TEMP_ROOT, { recursive: true });
  const dir = await mkdtemp(path.join(TEMP_ROOT, 'run-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const fullPath = path.join(dir, name);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf8');
    }
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const logger = createLogger({ sink: () => {} });

describe('testCommand against a real command-groups tree', () => {
  test("routes to the correct leaf via the testing harness's subcommand/subcommandGroup options", async () => {
    await withTempDir(
      {
        'config/_group.ts': `export default { name: "config", description: "Server configuration" };`,
        'config/roles/_group.ts': `export default { name: "roles", description: "Manage roles" };`,
        'config/roles/add.ts': `
          import { SlashCommandSubcommandBuilder } from "discord.js";
          export default {
            builder: new SlashCommandSubcommandBuilder().setName("add").setDescription("add"),
            execute: async (ctx) => { await ctx.interaction.reply("added"); },
          };
        `,
        'config/roles/remove.ts': `
          import { SlashCommandSubcommandBuilder } from "discord.js";
          export default {
            builder: new SlashCommandSubcommandBuilder().setName("remove").setDescription("remove"),
            execute: async (ctx) => { await ctx.interaction.reply("removed"); },
          };
        `,
      },
      async (dir) => {
        const registry = new CommandRegistry();
        await loadCommandGroups(dir, { registry, logger });
        const configCommand = registry.get('config');
        if (!configCommand) {
          throw new Error('expected the assembled config command group to be registered');
        }

        const addResult = await testCommand(configCommand, {
          subcommandGroup: 'roles',
          subcommand: 'add',
        });
        expect(addResult.replies).toEqual(['added' as never]);

        const removeResult = await testCommand(configCommand, {
          subcommandGroup: 'roles',
          subcommand: 'remove',
        });
        expect(removeResult.replies).toEqual(['removed' as never]);
      },
    );
  });
});
