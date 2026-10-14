import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectPackageManager, renderInitResult, runInit } from '../../src/cli/init.js';
import { prepareApp } from '../../src/cli/prepare-app.js';
import { createLogger } from '../../src/logging/logger.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'circe-init-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('runInit', () => {
  test('scaffolds circe.config.ts, src/config.ts, an example command, and env/gitignore files', async () => {
    const result = await runInit(dir);

    expect([...result.created].sort()).toEqual(
      [
        '.env.example',
        '.gitignore',
        'circe.config.ts',
        'src/commands/ping.ts',
        'src/config.ts',
        'tsconfig.json',
      ].sort(),
    );
    expect(result.skipped).toEqual([]);

    const config = await readFile(path.join(dir, 'circe.config.ts'), 'utf8');
    expect(config).toContain('defineCirceConfig');

    const command = await readFile(path.join(dir, 'src/commands/ping.ts'), 'utf8');
    expect(command).toContain('defineCommand');
  });

  test('never overwrites a file that already exists, and reports it as skipped', async () => {
    await writeFile(path.join(dir, 'circe.config.ts'), "// hand-written, don't touch\n", 'utf8');

    const result = await runInit(dir);

    expect(result.skipped).toContain('circe.config.ts');
    expect(result.created).not.toContain('circe.config.ts');

    const config = await readFile(path.join(dir, 'circe.config.ts'), 'utf8');
    expect(config).toBe("// hand-written, don't touch\n");
  });

  test('creates intermediate directories for nested scaffold files', async () => {
    await runInit(dir);

    const stat = await readFile(path.join(dir, 'src/commands/ping.ts'), 'utf8');
    expect(stat.length).toBeGreaterThan(0);
  });

  test('running twice skips every file the second time', async () => {
    await runInit(dir);
    const second = await runInit(dir);

    expect(second.created).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });
});

// The scaffold imports the package by name, which resolves to this repo's own dist/.
// The project has to live under the repo root so discord.js and zod resolve too.
const DIST_BUILT = existsSync(path.join(import.meta.dirname, '..', '..', 'dist'));
const SCAFFOLD_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-init');

describe('the scaffold', () => {
  afterAll(() => rm(SCAFFOLD_ROOT, { recursive: true, force: true }));

  test.skipIf(!DIST_BUILT)('passes the build check as generated', async () => {
    await mkdir(SCAFFOLD_ROOT, { recursive: true });
    const project = await mkdtemp(path.join(SCAFFOLD_ROOT, 'run-'));
    await runInit(project);
    process.env.DISCORD_TOKEN = 'test-token';

    const { app } = await prepareApp(project, createLogger({ sink: () => {} }));

    expect(app.commands.registry.size).toBe(1);
    expect(app.commands.registry.get('ping')).toBeDefined();
  });

  test('imports its own files with the .ts extension Node and Deno resolve', async () => {
    await runInit(dir);

    const config = await readFile(path.join(dir, 'circe.config.ts'), 'utf8');
    expect(config).toContain('./src/config.ts');
    expect(config).not.toContain('./src/config.js');
  });
});

describe('detectPackageManager', () => {
  test.each([
    ['bun/1.4.0 npm/? node/v24', 'bun'],
    ['pnpm/11.5.2 npm/? node/v22', 'pnpm'],
    ['yarn/4.9.2 npm/? node/v22', 'yarn'],
    ['npm/10.9.0 node/v22', 'npm'],
    [undefined, 'npm'],
  ] as const)('%p -> %p', (userAgent, expected) => {
    expect(detectPackageManager(userAgent)).toBe(expected);
  });
});

describe('renderInitResult', () => {
  test('names the commands of the package manager that ran it', () => {
    const result = { created: ['circe.config.ts'], skipped: [] };

    expect(renderInitResult(result, 'pnpm')).toContain('pnpm add @sxnnyside/circe discord.js zod');
    expect(renderInitResult(result, 'pnpm')).toContain('pnpm exec circe dev');
    expect(renderInitResult(result, 'bun')).toContain('bun x circe dev');
  });

  test('lists created and skipped files, with next steps only when something was created', () => {
    const output = renderInitResult({ created: ['circe.config.ts'], skipped: ['src/config.ts'] });

    expect(output).toContain('created  circe.config.ts');
    expect(output).toContain('skipped  src/config.ts (already exists)');
    expect(output).toContain('Next steps:');
  });

  test('omits next steps when everything was skipped', () => {
    const output = renderInitResult({ created: [], skipped: ['circe.config.ts'] });

    expect(output).not.toContain('Next steps:');
  });
});
