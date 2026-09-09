import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadModals } from "../../../src/discord/modals/loader.js";
import { ModalRegistry } from "../../../src/discord/modals/registry.js";
import { DiscoveryConflictError } from "../../../src/errors/discovery-conflict-error.js";
import { ModuleValidationError } from "../../../src/errors/module-validation-error.js";
import { createLogger } from "../../../src/logging/logger.js";

async function withTempDir(files: Record<string, string>, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "circe-modals-"));
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

const VALID_SUBMIT = `export default { prefix: "curate:submit:", execute: async () => {} };`;
const VALID_EDIT = `export default { prefix: "curate:edit:", execute: async () => {} };`;

describe("loadModals", () => {
  test("discovers, imports, and registers valid modal modules", async () => {
    await withTempDir({ "submit.js": VALID_SUBMIT, "edit.js": VALID_EDIT }, async (dir) => {
      const registry = new ModalRegistry();
      await loadModals(dir, { registry, logger });

      expect(registry.size).toBe(2);
      expect(registry.has("curate:submit:")).toBe(true);
      expect(registry.has("curate:edit:")).toBe(true);
    });
  });

  test("regression: discovers modals nested inside category subdirectories", async () => {
    await withTempDir(
      {
        "curate/submit.js": VALID_SUBMIT,
        "curate/edit.js": VALID_EDIT,
        "profile.js": `export default { prefix: "profile:", execute: async () => {} };`,
      },
      async (dir) => {
        const registry = new ModalRegistry();
        await loadModals(dir, { registry, logger });

        expect(registry.size).toBe(3);
        expect(registry.has("profile:")).toBe(true);
      },
    );
  });

  test("throws ModuleValidationError naming exactly `execute` as missing when the default export has no execute function", async () => {
    await withTempDir({ "broken.js": 'export default { prefix: "curate:" };' }, async (dir) => {
      const registry = new ModalRegistry();
      try {
        await loadModals(dir, { registry, logger });
        throw new Error("expected loadModals to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues).toEqual([{ file: "broken.js", message: "missing `execute`" }]);
      }
    });
  });

  test("throws ModuleValidationError naming exactly `prefix` as missing when the default export has no prefix", async () => {
    await withTempDir({ "broken.js": "export default { execute: async () => {} };" }, async (dir) => {
      const registry = new ModalRegistry();
      try {
        await loadModals(dir, { registry, logger });
        throw new Error("expected loadModals to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues).toEqual([{ file: "broken.js", message: "missing `prefix`" }]);
      }
    });
  });

  test("throws ModuleValidationError, not a silent skip, when a module fails to import", async () => {
    await withTempDir({ "broken.js": "throw new Error('boom during import');" }, async (dir) => {
      const registry = new ModalRegistry();
      try {
        await loadModals(dir, { registry, logger });
        throw new Error("expected loadModals to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues[0]?.message).toContain("boom during import");
      }
      expect(registry.size).toBe(0);
    });
  });

  test("surfaces duplicate prefixes discovered across two files, nested or not, as DiscoveryConflictError", async () => {
    await withTempDir({ "a.js": VALID_SUBMIT, "curate/b.js": VALID_SUBMIT }, async (dir) => {
      const registry = new ModalRegistry();
      try {
        await loadModals(dir, { registry, logger });
        throw new Error("expected loadModals to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(DiscoveryConflictError);
        expect((error as DiscoveryConflictError).identity).toBe("curate:submit:");
      }
    });
  });
});
