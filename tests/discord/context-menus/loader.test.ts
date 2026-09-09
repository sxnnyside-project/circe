import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadContextMenuCommands } from "../../../src/discord/context-menus/loader.js";
import { ContextMenuCommandRegistry } from "../../../src/discord/context-menus/registry.js";
import { DiscoveryConflictError } from "../../../src/errors/discovery-conflict-error.js";
import { ModuleValidationError } from "../../../src/errors/module-validation-error.js";
import { createLogger } from "../../../src/logging/logger.js";

async function withTempDir(files: Record<string, string>, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "circe-context-menus-"));
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

const VALID_REPORT_USER = `export default { name: "Report User", execute: async () => {} };`;
const VALID_PIN_MESSAGE = `export default { name: "Pin Message", execute: async () => {} };`;

describe("loadContextMenuCommands", () => {
  test("discovers user and message commands from their fixed subfolders", async () => {
    await withTempDir(
      { "users/report-user.js": VALID_REPORT_USER, "messages/pin-message.js": VALID_PIN_MESSAGE },
      async (dir) => {
        const registry = new ContextMenuCommandRegistry();
        await loadContextMenuCommands(dir, { registry, logger });

        expect(registry.size).toBe(2);
        expect(registry.getUser("Report User")).toBeDefined();
        expect(registry.getMessage("Pin Message")).toBeDefined();
      },
    );
  });

  test("a user command and a message command may share the same name", async () => {
    await withTempDir(
      {
        "users/report.js": `export default { name: "Report", execute: async () => {} };`,
        "messages/report.js": `export default { name: "Report", execute: async () => {} };`,
      },
      async (dir) => {
        const registry = new ContextMenuCommandRegistry();
        await loadContextMenuCommands(dir, { registry, logger });

        expect(registry.size).toBe(2);
        expect(registry.getUser("Report")).toBeDefined();
        expect(registry.getMessage("Report")).toBeDefined();
      },
    );
  });

  test("only scans the subfolder that exists", async () => {
    await withTempDir({ "users/report-user.js": VALID_REPORT_USER }, async (dir) => {
      const registry = new ContextMenuCommandRegistry();
      await loadContextMenuCommands(dir, { registry, logger });

      expect(registry.size).toBe(1);
      expect(registry.allMessage).toEqual([]);
    });
  });

  test("does nothing when neither subfolder exists", async () => {
    await withTempDir({}, async (dir) => {
      const registry = new ContextMenuCommandRegistry();
      await loadContextMenuCommands(dir, { registry, logger });
      expect(registry.size).toBe(0);
    });
  });

  test("aggregates shape issues from both subfolders into one ModuleValidationError, file-prefixed by subfolder", async () => {
    await withTempDir(
      {
        "users/broken.js": "export default { execute: async () => {} };",
        "messages/broken.js": "export default { name: 'Pin' };",
      },
      async (dir) => {
        const registry = new ContextMenuCommandRegistry();
        try {
          await loadContextMenuCommands(dir, { registry, logger });
          throw new Error("expected loadContextMenuCommands to throw");
        } catch (error) {
          expect(error).toBeInstanceOf(ModuleValidationError);
          const issues = (error as ModuleValidationError).issues;
          expect(issues).toContainEqual({ file: path.join("users", "broken.js"), message: "missing `name`" });
          expect(issues).toContainEqual({ file: path.join("messages", "broken.js"), message: "missing `execute`" });
        }
      },
    );
  });

  test("throws DiscoveryConflictError on a duplicate user command name across two files", async () => {
    await withTempDir({ "users/a.js": VALID_REPORT_USER, "users/b.js": VALID_REPORT_USER }, async (dir) => {
      const registry = new ContextMenuCommandRegistry();
      await expect(loadContextMenuCommands(dir, { registry, logger })).rejects.toBeInstanceOf(DiscoveryConflictError);
    });
  });
});
