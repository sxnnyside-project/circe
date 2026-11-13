import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareApp } from '../../src/application/prepare-app.js';
import { type Runtime, runInit, type TemplateTier } from '../../src/cli/init.js';
import { createLogger } from '../../src/logging/logger.js';

const TEMPLATES_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-templates');
let dir: string;
const originalEnv = { ...process.env };

beforeEach(async () => {
  await mkdir(TEMPLATES_ROOT, { recursive: true });
  // A Deno scaffold has no package.json, so its imports would resolve inside this repository's own
  // package, whose `exports` point at `dist` (absent unless built). Its own scope sends them to the
  // `@sxnnyside/circe` entry that tests/preload.ts links to `src`.
  await writeFile(
    path.join(TEMPLATES_ROOT, 'package.json'),
    '{ "name": "circe-template-fixtures", "private": true, "type": "module" }\n',
  );
  dir = await mkdtemp(path.join(TEMPLATES_ROOT, 'tpl-'));
  process.env.DISCORD_TOKEN = 'test-token-valid-sample-0123456789';
  process.env.DISCORD_CLIENT_ID = '123456789012345678';
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(TEMPLATES_ROOT, { recursive: true, force: true });
});

const RUNTIMES: readonly Runtime[] = ['bun', 'deno', 'node'];
const TIERS: readonly TemplateTier[] = ['minimal', 'standard', 'advanced'];

describe('Template Verification Suite (All 9 Combinations)', () => {
  for (const runtime of RUNTIMES) {
    for (const tier of TIERS) {
      test(`verifies ${runtime} - ${tier} template integrity and contract`, async () => {
        const result = await runInit(dir, { runtime, template: tier });

        expect(result.runtime).toBe(runtime);
        expect(result.template).toBe(tier);
        expect(result.created.length).toBeGreaterThan(0);
        expect(result.skipped).toEqual([]);

        // Common files check
        expect(existsSync(path.join(dir, 'circe.config.ts'))).toBe(true);
        expect(existsSync(path.join(dir, '.env.example'))).toBe(true);
        expect(existsSync(path.join(dir, '.gitignore'))).toBe(true);
        expect(existsSync(path.join(dir, 'src', 'config.ts'))).toBe(true);
        expect(existsSync(path.join(dir, 'src', 'commands', 'ping.ts'))).toBe(true);

        // Runtime specific manifest check
        if (runtime === 'deno') {
          expect(existsSync(path.join(dir, 'deno.json'))).toBe(true);
          expect(existsSync(path.join(dir, 'package.json'))).toBe(false);
          expect(existsSync(path.join(dir, 'tsconfig.json'))).toBe(false);

          const denoRaw = await readFile(path.join(dir, 'deno.json'), 'utf8');
          const denoJson = JSON.parse(denoRaw) as {
            tasks?: Record<string, string>;
            imports?: Record<string, string>;
          };
          expect(denoJson.tasks?.dev).toBeDefined();
          expect(denoJson.imports?.['@sxnnyside/circe']).toBeDefined();
        } else {
          expect(existsSync(path.join(dir, 'package.json'))).toBe(true);
          expect(existsSync(path.join(dir, 'tsconfig.json'))).toBe(true);
          expect(existsSync(path.join(dir, 'deno.json'))).toBe(false);

          const pkgRaw = await readFile(path.join(dir, 'package.json'), 'utf8');
          const pkgJson = JSON.parse(pkgRaw) as {
            scripts?: Record<string, string>;
            dependencies?: Record<string, string>;
          };
          expect(pkgJson.scripts?.dev).toBeDefined();
          expect(pkgJson.dependencies?.['@sxnnyside/circe']).toBeDefined();
        }

        // Tier specific structural check
        if (tier === 'standard' || tier === 'advanced') {
          expect(existsSync(path.join(dir, 'src', 'error.ts'))).toBe(true);
          expect(existsSync(path.join(dir, 'src', 'localization.ts'))).toBe(true);
          expect(existsSync(path.join(dir, 'src', 'middleware.ts'))).toBe(true);
          expect(existsSync(path.join(dir, 'src', 'events', 'ready.ts'))).toBe(true);
        }

        if (tier === 'standard') {
          expect(existsSync(path.join(dir, 'src', 'commands', 'help.ts'))).toBe(true);
          expect(existsSync(path.join(dir, 'src', 'components', 'action-button.ts'))).toBe(true);
        }

        if (tier === 'advanced') {
          expect(existsSync(path.join(dir, 'Dockerfile'))).toBe(true);
          expect(existsSync(path.join(dir, 'src', 'command-groups', 'admin', '_group.ts'))).toBe(
            true,
          );
          expect(existsSync(path.join(dir, 'src', 'command-groups', 'admin', 'kick.ts'))).toBe(
            true,
          );
          expect(existsSync(path.join(dir, 'src', 'context-menus', 'users', 'avatar.ts'))).toBe(
            true,
          );
          expect(
            existsSync(path.join(dir, 'src', 'context-menus', 'messages', 'bookmark.ts')),
          ).toBe(true);
          expect(existsSync(path.join(dir, 'src', 'modals', 'feedback.ts'))).toBe(true);
          expect(existsSync(path.join(dir, 'src', 'components', 'pagination.ts'))).toBe(true);
        }

        // Validate that circe.config.ts and src/config.ts can be dynamically imported
        const configModule = await import(pathToFileURL(path.join(dir, 'circe.config.ts')).href);
        expect(configModule.default).toBeDefined();

        const envModule = await import(pathToFileURL(path.join(dir, 'src', 'config.ts')).href);
        expect(envModule.default).toBeDefined();
      });
    }
  }

  test('scaffolded Bun Minimal project passes prepareApp module discovery', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });
    const logger = createLogger({ sink: () => {} });
    const { app } = await prepareApp(dir, logger);

    expect(app.commands.registry.size).toBe(1);
    expect(app.commands.registry.get('ping')).toBeDefined();
  });

  test('scaffolded Bun Standard project passes prepareApp module discovery', async () => {
    await runInit(dir, { runtime: 'bun', template: 'standard' });
    const logger = createLogger({ sink: () => {} });
    const { app } = await prepareApp(dir, logger);

    expect(app.commands.registry.size).toBe(2);
    expect(app.commands.registry.get('ping')).toBeDefined();
    expect(app.commands.registry.get('help')).toBeDefined();
    expect(app.events.registry.size).toBeGreaterThanOrEqual(1);
    expect(app.components.registry.size).toBeGreaterThanOrEqual(1);
  });

  test('scaffolded Bun Advanced project passes prepareApp module discovery', async () => {
    await runInit(dir, { runtime: 'bun', template: 'advanced' });
    const logger = createLogger({ sink: () => {} });
    const { app } = await prepareApp(dir, logger);

    expect(app.commands.registry.size).toBeGreaterThanOrEqual(1);
    expect(app.commands.registry.get('ping')).toBeDefined();
    expect(app.modals.registry.size).toBeGreaterThanOrEqual(1);
    expect(app.contextMenuCommands.registry.size).toBeGreaterThanOrEqual(2);
    expect(app.components.registry.size).toBeGreaterThanOrEqual(1);
  });
});
