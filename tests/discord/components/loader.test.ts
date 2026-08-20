import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ComponentError } from "../../../src/discord/components/errors.js";
import { loadComponents } from "../../../src/discord/components/loader.js";
import { ComponentRegistry } from "../../../src/discord/components/registry.js";
import { createLogger } from "../../../src/logging/logger.js";

async function withTempDir(files: Record<string, string>, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "circe-components-"));
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

const VALID_SAVE = `export default { prefix: "crate:save:", execute: async () => {} };`;
const VALID_REMOVE = `export default { prefix: "crate:remove:", execute: async () => {} };`;

describe("loadComponents", () => {
  test("discovers, imports, and registers valid component modules", async () => {
    await withTempDir({ "save.js": VALID_SAVE, "remove.js": VALID_REMOVE }, async (dir) => {
      const registry = new ComponentRegistry();
      await loadComponents(dir, { registry, logger });

      expect(registry.size).toBe(2);
      expect(registry.has("crate:save:")).toBe(true);
      expect(registry.has("crate:remove:")).toBe(true);
    });
  });

  test("regression: discovers components nested inside category subdirectories", async () => {
    await withTempDir(
      {
        "crate/save.js": VALID_SAVE,
        "crate/remove.js": VALID_REMOVE,
        "profile.js": `export default { prefix: "profile:", execute: async () => {} };`,
      },
      async (dir) => {
        const registry = new ComponentRegistry();
        await loadComponents(dir, { registry, logger });

        expect(registry.size).toBe(3);
        expect(registry.has("profile:")).toBe(true);
      },
    );
  });

  test("throws ComponentError when the default export has no execute function", async () => {
    await withTempDir({ "broken.js": 'export default { prefix: "crate:" };' }, async (dir) => {
      const registry = new ComponentRegistry();
      await expect(loadComponents(dir, { registry, logger })).rejects.toBeInstanceOf(ComponentError);
    });
  });

  test("throws ComponentError when the default export has no prefix", async () => {
    await withTempDir({ "broken.js": "export default { execute: async () => {} };" }, async (dir) => {
      const registry = new ComponentRegistry();
      await expect(loadComponents(dir, { registry, logger })).rejects.toBeInstanceOf(ComponentError);
    });
  });

  test("throws ComponentError, not a silent skip, when a module fails to import", async () => {
    await withTempDir({ "broken.js": "throw new Error('boom during import');" }, async (dir) => {
      const registry = new ComponentRegistry();
      await expect(loadComponents(dir, { registry, logger })).rejects.toBeInstanceOf(ComponentError);
      expect(registry.size).toBe(0);
    });
  });

  test("surfaces duplicate prefixes discovered across two files, nested or not", async () => {
    await withTempDir({ "a.js": VALID_SAVE, "crate/b.js": VALID_SAVE }, async (dir) => {
      const registry = new ComponentRegistry();
      await expect(loadComponents(dir, { registry, logger })).rejects.toBeInstanceOf(ComponentError);
    });
  });
});
