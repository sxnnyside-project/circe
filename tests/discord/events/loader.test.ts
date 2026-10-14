import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadEvents } from '../../../src/discord/events/loader.js';
import { EventRegistry } from '../../../src/discord/events/registry.js';
import { ModuleValidationError } from '../../../src/errors/module-validation-error.js';
import { createLogger } from '../../../src/logging/logger.js';

async function withTempDir(
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'circe-events-'));
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

const VALID_READY = `export default { name: "ready", once: true, execute: () => {} };`;
const VALID_GUILD_CREATE = `export default { name: "guildCreate", execute: () => {} };`;

describe('loadEvents', () => {
  test('discovers, imports, and registers valid event modules', async () => {
    await withTempDir(
      { 'ready.js': VALID_READY, 'guild-create.js': VALID_GUILD_CREATE },
      async (dir) => {
        const registry = new EventRegistry();
        await loadEvents(dir, { registry, logger });

        expect(registry.size).toBe(2);
        const names = registry.all.map((event) => event.name).sort();
        expect(names).toEqual(['guildCreate', 'ready']);
      },
    );
  });

  test('preserves the once flag from the module', async () => {
    await withTempDir({ 'ready.js': VALID_READY }, async (dir) => {
      const registry = new EventRegistry();
      await loadEvents(dir, { registry, logger });

      expect(registry.all[0]?.once).toBe(true);
    });
  });

  test('throws ModuleValidationError naming exactly `execute` as missing when the default export has no execute function', async () => {
    await withTempDir({ 'broken.js': 'export default { name: "ready" };' }, async (dir) => {
      const registry = new EventRegistry();
      try {
        await loadEvents(dir, { registry, logger });
        throw new Error('expected loadEvents to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues).toEqual([
          { file: 'broken.js', message: 'missing `execute`' },
        ]);
      }
    });
  });

  test('throws ModuleValidationError naming exactly `name` as missing when the default export has no name', async () => {
    await withTempDir({ 'broken.js': 'export default { execute: () => {} };' }, async (dir) => {
      const registry = new EventRegistry();
      try {
        await loadEvents(dir, { registry, logger });
        throw new Error('expected loadEvents to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues).toEqual([
          { file: 'broken.js', message: 'missing `name`' },
        ]);
      }
    });
  });

  test('throws ModuleValidationError, not a silent skip, when a module fails to import', async () => {
    await withTempDir({ 'broken.js': "throw new Error('boom during import');" }, async (dir) => {
      const registry = new EventRegistry();
      try {
        await loadEvents(dir, { registry, logger });
        throw new Error('expected loadEvents to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleValidationError);
        expect((error as ModuleValidationError).issues[0]?.message).toContain('boom during import');
      }
      expect(registry.size).toBe(0);
    });
  });

  test('regression: discovers events nested inside subdirectories', async () => {
    await withTempDir(
      {
        'client/ready.js': VALID_READY,
        'guild/guild-create.js': VALID_GUILD_CREATE,
      },
      async (dir) => {
        const registry = new EventRegistry();
        await loadEvents(dir, { registry, logger });

        expect(registry.size).toBe(2);
        const names = registry.all.map((event) => event.name).sort();
        expect(names).toEqual(['guildCreate', 'ready']);
      },
    );
  });
});
