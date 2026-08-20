import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CommandError } from "../../../src/discord/commands/errors.js";
import { loadCommands } from "../../../src/discord/commands/loader.js";
import { CommandRegistry } from "../../../src/discord/commands/registry.js";
import { createLogger, type LogEntry } from "../../../src/logging/logger.js";

async function withTempDir(files: Record<string, string>, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "circe-commands-"));
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

function silentLogger(): { logger: ReturnType<typeof createLogger>; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

const VALID_PING = `
export default {
  builder: { name: "ping", description: "ping", toJSON: () => ({ name: "ping" }) },
  execute: async () => {},
};
`;

const VALID_PONG = `
export default {
  builder: { name: "pong", description: "pong", toJSON: () => ({ name: "pong" }) },
  execute: async () => {},
};
`;

describe("loadCommands", () => {
  test("discovers, imports, and registers valid command modules", async () => {
    await withTempDir({ "ping.js": VALID_PING, "pong.js": VALID_PONG }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      await loadCommands(dir, { registry, logger });

      expect(registry.size).toBe(2);
      expect(registry.get("ping")).toBeDefined();
      expect(registry.get("pong")).toBeDefined();
    });
  });

  test("ignores non-command files in the directory", async () => {
    await withTempDir({ "ping.js": VALID_PING, "README.md": "not a command" }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      await loadCommands(dir, { registry, logger });

      expect(registry.size).toBe(1);
    });
  });

  test("throws CommandError when a module has no default export", async () => {
    await withTempDir({ "broken.js": "export const notDefault = {};" }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      await expect(loadCommands(dir, { registry, logger })).rejects.toBeInstanceOf(CommandError);
    });
  });

  test("throws CommandError when the default export has no execute function", async () => {
    await withTempDir(
      { "broken.js": 'export default { builder: { name: "broken", toJSON: () => ({}) } };' },
      async (dir) => {
        const registry = new CommandRegistry();
        const { logger } = silentLogger();

        await expect(loadCommands(dir, { registry, logger })).rejects.toBeInstanceOf(CommandError);
      },
    );
  });

  test("throws CommandError when the builder has no name", async () => {
    await withTempDir({ "broken.js": "export default { builder: {}, execute: async () => {} };" }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      await expect(loadCommands(dir, { registry, logger })).rejects.toBeInstanceOf(CommandError);
    });
  });

  test("throws CommandError, not a silent skip, when a module fails to import", async () => {
    await withTempDir({ "broken.js": "throw new Error('boom during import');" }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      await expect(loadCommands(dir, { registry, logger })).rejects.toBeInstanceOf(CommandError);
      expect(registry.size).toBe(0);
    });
  });

  test("surfaces duplicate command names discovered across two files", async () => {
    await withTempDir({ "a.js": VALID_PING, "b.js": VALID_PING }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      await expect(loadCommands(dir, { registry, logger })).rejects.toBeInstanceOf(CommandError);
    });
  });

  test("regression: discovers commands nested inside category subdirectories", async () => {
    await withTempDir(
      {
        "moderation/ban.js": VALID_PING,
        "utility/pong.js": VALID_PONG,
      },
      async (dir) => {
        const registry = new CommandRegistry();
        const { logger } = silentLogger();

        await loadCommands(dir, { registry, logger });

        expect(registry.size).toBe(2);
        expect(registry.get("ping")).toBeDefined();
        expect(registry.get("pong")).toBeDefined();
      },
    );
  });

  test("regression: nested and top-level duplicate command names are still detected", async () => {
    await withTempDir({ "ping.js": VALID_PING, "moderation/ping.js": VALID_PING }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      await expect(loadCommands(dir, { registry, logger })).rejects.toBeInstanceOf(CommandError);
    });
  });
});
