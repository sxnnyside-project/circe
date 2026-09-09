import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCommands } from "../../../src/discord/commands/loader.js";
import { CommandRegistry } from "../../../src/discord/commands/registry.js";
import { DiscoveryConflictError } from "../../../src/errors/discovery-conflict-error.js";
import { ModuleValidationError } from "../../../src/errors/module-validation-error.js";
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
    await withTempDir(
      {
        "ping.js": VALID_PING,
        "README.md": "not a command",
        "ping.d.ts": "export declare const ping: unknown;",
        "ping.d.mts": "export declare const ping: unknown;",
        "ping.d.cts": "export declare const ping: unknown;",
      },
      async (dir) => {
        const registry = new CommandRegistry();
        const { logger } = silentLogger();

        await loadCommands(dir, { registry, logger });

        expect(registry.size).toBe(1);
        expect(registry.get("ping")).toBeDefined();
      },
    );
  });

  test("discovers and loads .mjs and .cjs command modules", async () => {
    await withTempDir(
      {
        "ping.mjs": VALID_PING,
        "pong.cjs":
          'module.exports = { builder: { name: "pong", description: "pong", toJSON: () => ({ name: "pong" }) }, execute: async () => {} };',
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

  test("throws ModuleValidationError naming the missing `builder`/`execute` fields when a module has no default export", async () => {
    await withTempDir({ "broken.js": "export const notDefault = {};" }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      try {
        await loadCommands(dir, { registry, logger });
        throw new Error("expected loadCommands to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        const validationError = error as ModuleValidationError;
        expect(validationError.category).toBe("commands");
        expect(validationError.issues).toEqual([
          { file: "broken.js", message: "does not export a default command definition object" },
        ]);
      }
    });
  });

  test("throws ModuleValidationError naming exactly `execute` as missing when the default export has no execute function", async () => {
    await withTempDir(
      { "broken.js": 'export default { builder: { name: "broken", toJSON: () => ({}) } };' },
      async (dir) => {
        const registry = new CommandRegistry();
        const { logger } = silentLogger();

        try {
          await loadCommands(dir, { registry, logger });
          throw new Error("expected loadCommands to throw");
        } catch (error) {
          expect(error).toBeInstanceOf(ModuleValidationError);
          expect((error as ModuleValidationError).issues).toEqual([
            { file: "broken.js", message: "missing `execute`" },
          ]);
        }
      },
    );
  });

  test("throws ModuleValidationError naming exactly the builder's missing `name` when the builder has no name", async () => {
    await withTempDir({ "broken.js": "export default { builder: {}, execute: async () => {} };" }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      try {
        await loadCommands(dir, { registry, logger });
        throw new Error("expected loadCommands to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues).toEqual([
          { file: "broken.js", message: "`builder` is missing a `name`" },
        ]);
      }
    });
  });

  test("throws ModuleValidationError, not a silent skip, when a module fails to import", async () => {
    await withTempDir({ "broken.js": "throw new Error('boom during import');" }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      try {
        await loadCommands(dir, { registry, logger });
        throw new Error("expected loadCommands to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues[0]?.file).toBe("broken.js");
        expect((error as ModuleValidationError).issues[0]?.message).toContain("boom during import");
      }
      expect(registry.size).toBe(0);
    });
  });

  test("aggregates every issue across a directory into one ModuleValidationError, instead of stopping at the first", async () => {
    await withTempDir(
      {
        "a.js": "export const notDefault = {};",
        "b.js": "export default { builder: {}, execute: async () => {} };",
      },
      async (dir) => {
        const registry = new CommandRegistry();
        const { logger } = silentLogger();

        try {
          await loadCommands(dir, { registry, logger });
          throw new Error("expected loadCommands to throw");
        } catch (error) {
          expect(error).toBeInstanceOf(ModuleValidationError);
          expect((error as ModuleValidationError).issues).toEqual([
            { file: "a.js", message: "does not export a default command definition object" },
            { file: "b.js", message: "`builder` is missing a `name`" },
          ]);
        }
      },
    );
  });

  test("surfaces duplicate command names discovered across two files as DiscoveryConflictError", async () => {
    await withTempDir({ "a.js": VALID_PING, "b.js": VALID_PING }, async (dir) => {
      const registry = new CommandRegistry();
      const { logger } = silentLogger();

      try {
        await loadCommands(dir, { registry, logger });
        throw new Error("expected loadCommands to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(DiscoveryConflictError);
        expect((error as DiscoveryConflictError).identity).toBe("ping");
      }
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

      await expect(loadCommands(dir, { registry, logger })).rejects.toBeInstanceOf(DiscoveryConflictError);
    });
  });
});
