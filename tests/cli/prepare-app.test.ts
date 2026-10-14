import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  prepareApp,
} from '../../src/cli/prepare-app.js';
import type { LogEntry } from '../../src/logging/logger.js';
import { createLogger } from '../../src/logging/logger.js';

// `circe.config.ts` fixtures need `zod` to resolve at runtime — the temp
// project has to live under this package's own root (not the OS tmpdir)
// so Node/Bun module resolution walks up to this package's `node_modules`.
const TEMP_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-cli');

// Removes the (empty) root once the file's runs are done, so a test run leaves nothing behind.
afterAll(() => rm(TEMP_ROOT, { recursive: true, force: true }));
const SRC = path.join(import.meta.dirname, '..', '..', 'src');

async function withProject(
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

function silentLogger(): { logger: ReturnType<typeof createLogger>; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

const CONFIG_FIXTURE = `
import { defineCirceConfig } from "${pathToSrc('config/circe-config.js')}";
import { defineConfig } from "${pathToSrc('config/config.js')}";
import { z } from "zod";

export default defineCirceConfig({
  config: defineConfig(z.object({ token: z.string().min(1), clientId: z.string().min(1) })),
  intents: [],
});
`;

function pathToSrc(relative: string): string {
  return path.join(SRC, relative).replace(/\\/g, '/');
}

const VALID_PING = `
export default {
  builder: { name: "ping", description: "ping", toJSON: () => ({ name: "ping" }) },
  execute: async () => {},
};
`;

describe('prepareApp', () => {
  // `prepareApp` calls `config.load()` with no explicit source, so it reads
  // `process.env` directly — these fixtures' schema needs `token`/`clientId` present.
  beforeEach(() => {
    process.env.token = 'test-token';
    process.env.clientId = 'test-client-id';
  });
  afterEach(() => {
    delete process.env.token;
    delete process.env.clientId;
  });

  test('throws ConfigFileNotFoundError when circe.config.ts is absent', async () => {
    await withProject({}, async (dir) => {
      const { logger } = silentLogger();
      await expect(prepareApp(dir, logger)).rejects.toBeInstanceOf(ConfigFileNotFoundError);
    });
  });

  test('explains a runtime that cannot load TypeScript instead of surfacing the bare loader error', async () => {
    const config = `throw Object.assign(new Error('Unknown file extension ".ts"'), { code: 'ERR_UNKNOWN_FILE_EXTENSION' });`;
    await withProject({ 'circe.config.ts': config }, async (dir) => {
      const { logger } = silentLogger();
      await expect(prepareApp(dir, logger)).rejects.toThrow('Node.js 22.18 or later');
    });
  });

  test('throws ConfigFileInvalidError when the file has no default export', async () => {
    await withProject({ 'circe.config.ts': 'export const notDefault = {};' }, async (dir) => {
      const { logger } = silentLogger();
      await expect(prepareApp(dir, logger)).rejects.toBeInstanceOf(ConfigFileInvalidError);
    });
  });

  test('scans commands under the default scanRoot and registers them', async () => {
    await withProject(
      { 'circe.config.ts': CONFIG_FIXTURE, 'src/commands/ping.ts': VALID_PING },
      async (dir) => {
        const { logger } = silentLogger();
        const { app, scanRoot } = await prepareApp(dir, logger);

        expect(scanRoot).toBe(path.join(dir, 'src'));
        expect(app.commands.registry.size).toBe(1);
        expect(app.commands.registry.get('ping')).toBeDefined();
      },
    );
  });

  test('forwards shutdownTimeoutMs from circe.config.ts to the application', async () => {
    // createCirce validates the value, so the rejection proves it was passed on.
    const config = CONFIG_FIXTURE.replace('intents: [],', 'intents: [],\n  shutdownTimeoutMs: 0,');
    await withProject({ 'circe.config.ts': config }, async (dir) => {
      const { logger } = silentLogger();
      await expect(prepareApp(dir, logger)).rejects.toThrow('shutdownTimeoutMs');
    });
  });

  test('respects a custom scanRoot from circe.config.ts', async () => {
    const customConfig = CONFIG_FIXTURE.replace(
      'intents: [],',
      'intents: [],\n  scanRoot: "./bot",',
    );
    await withProject(
      { 'circe.config.ts': customConfig, 'bot/commands/ping.ts': VALID_PING },
      async (dir) => {
        const { logger } = silentLogger();
        const { app, scanRoot } = await prepareApp(dir, logger);

        expect(scanRoot).toBe(path.join(dir, 'bot'));
        expect(app.commands.registry.size).toBe(1);
      },
    );
  });

  test('warns when scanning finds nothing at all', async () => {
    await withProject({ 'circe.config.ts': CONFIG_FIXTURE }, async (dir) => {
      const { logger, entries } = silentLogger();
      await prepareApp(dir, logger);

      const warning = entries.find((entry) => entry.level === 'warn');
      expect(warning?.message).toContain('No commands, events, components, or modals discovered');
    });
  });

  test('does not warn when at least one module was discovered', async () => {
    await withProject(
      { 'circe.config.ts': CONFIG_FIXTURE, 'src/commands/ping.ts': VALID_PING },
      async (dir) => {
        const { logger, entries } = silentLogger();
        await prepareApp(dir, logger);

        expect(entries.some((entry) => entry.level === 'warn')).toBe(false);
      },
    );
  });

  test('defaults transport to gateway with no httpConfig', async () => {
    await withProject({ 'circe.config.ts': CONFIG_FIXTURE }, async (dir) => {
      const { logger } = silentLogger();
      const { transport, httpConfig } = await prepareApp(dir, logger);

      expect(transport).toBe('gateway');
      expect(httpConfig).toBeUndefined();
    });
  });

  test('throws ConfigFileInvalidError when transport is http without an http.publicKey block', async () => {
    const config = CONFIG_FIXTURE.replace('intents: [],', 'intents: [],\n  transport: "http",');
    await withProject({ 'circe.config.ts': config }, async (dir) => {
      const { logger } = silentLogger();
      await expect(prepareApp(dir, logger)).rejects.toBeInstanceOf(ConfigFileInvalidError);
    });
  });

  test('throws ConfigFileInvalidError when transport is hybrid without an http.publicKey block', async () => {
    const config = CONFIG_FIXTURE.replace('intents: [],', 'intents: [],\n  transport: "hybrid",');
    await withProject({ 'circe.config.ts': config }, async (dir) => {
      const { logger } = silentLogger();
      await expect(prepareApp(dir, logger)).rejects.toBeInstanceOf(ConfigFileInvalidError);
    });
  });

  test('accepts and returns a well-formed http transport config, without opening a gateway connection', async () => {
    const config = CONFIG_FIXTURE.replace(
      'intents: [],',
      'intents: [],\n  transport: "http",\n  http: { publicKey: "aa".repeat(32), port: 9999 },',
    );
    await withProject({ 'circe.config.ts': config }, async (dir) => {
      const { logger } = silentLogger();
      const { transport, httpConfig, app } = await prepareApp(dir, logger);

      expect(transport).toBe('http');
      expect(httpConfig).toEqual({ publicKey: 'aa'.repeat(32), port: 9999 });
      // "created" — prepareApp never calls app.start() regardless of transport.
      expect(app.state).toBe('created');
    });
  });
});
