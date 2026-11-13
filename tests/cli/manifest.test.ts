import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runInit } from '../../src/cli/init.js';
import {
  buildManifest,
  MANIFEST_RELATIVE_PATH,
  renderManifest,
  runManifest,
} from '../../src/cli/manifest.js';
import { readVersion } from '../../src/cli/version.js';

const MANIFEST_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-manifest');
let dir: string;
const originalEnv = { ...process.env };

beforeEach(async () => {
  await mkdir(MANIFEST_ROOT, { recursive: true });
  dir = await mkdtemp(path.join(MANIFEST_ROOT, 'test-'));
  process.env.DISCORD_TOKEN = 'test-token-valid-01234567890123456789';
  process.env.DISCORD_CLIENT_ID = '123456789012345678';
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(MANIFEST_ROOT, { recursive: true, force: true });
});

describe('buildManifest', () => {
  test('summarizes a minimal project: transport, scan root, routes, and capabilities', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });

    const manifest = await buildManifest(dir);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.generator).toEqual({ name: '@sxnnyside/circe', version: readVersion() });
    expect(manifest.project.transport).toBe('gateway');
    expect(manifest.project.scanRoot).toBe('src');
    expect(manifest.project.http).toBeNull();
    expect(manifest.project.intents).toContain('Guilds');
    expect(manifest.routes.map((route) => route.name)).toEqual(['/ping']);
    expect(manifest.capabilities).toEqual({ command: 1 });
  });

  test('detects optional conventions and counts every route kind in an advanced project', async () => {
    await runInit(dir, { runtime: 'bun', template: 'advanced' });

    const manifest = await buildManifest(dir);

    expect(manifest.conventions.middleware).toBe(true);
    expect(manifest.conventions.errorBoundary).toBe(true);
    expect(manifest.conventions.localization).toBe('localization.ts');
    expect(manifest.conventions.skills).toEqual([
      'circe-add-module',
      'circe-diagnose-errors',
      'circe-project-conventions',
      'circe-verify-changes',
    ]);
    expect(manifest.capabilities.subcommand).toBeGreaterThanOrEqual(1);
    expect(manifest.capabilities['user-context-menu']).toBeGreaterThanOrEqual(1);
    expect(manifest.capabilities.modal).toBeGreaterThanOrEqual(1);

    const total = Object.values(manifest.capabilities).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(manifest.routes.length);
  });

  test('is deterministic and never leaks credentials', async () => {
    await runInit(dir, { runtime: 'bun', template: 'standard' });

    const first = renderManifest(await buildManifest(dir));
    const second = renderManifest(await buildManifest(dir));

    expect(first).toBe(second);
    expect(first).not.toContain(process.env.DISCORD_TOKEN as string);
    expect(first).not.toContain('publicKey');
    expect(first).not.toContain(dir);
  });

  test('reports an empty skills list when the project has no .agents/skills', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });
    await rm(path.join(dir, '.agents'), { recursive: true, force: true });

    expect((await buildManifest(dir)).conventions.skills).toEqual([]);
  });

  test('rejects a directory without circe.config.ts', async () => {
    await expect(buildManifest(dir)).rejects.toThrow(/circe\.config\.ts not found/);
  });
});

describe('runManifest', () => {
  test('write creates .circe/project.json, then reports up-to-date without rewriting', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });

    const first = await runManifest(dir, 'write');
    expect(first.status).toBe('written');
    expect(first.path).toBe(MANIFEST_RELATIVE_PATH);
    expect(existsSync(path.join(dir, MANIFEST_RELATIVE_PATH))).toBe(true);

    const onDisk = await readFile(path.join(dir, MANIFEST_RELATIVE_PATH), 'utf8');
    expect(onDisk).toBe(renderManifest(first.manifest));
    expect(onDisk.endsWith('\n')).toBe(true);

    const second = await runManifest(dir, 'write');
    expect(second.status).toBe('up-to-date');
    expect(second.ok).toBe(true);
  });

  test('check reports missing, then up-to-date, then stale after a route is added', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });

    const missing = await runManifest(dir, 'check');
    expect(missing).toMatchObject({ ok: false, status: 'missing' });
    expect(existsSync(path.join(dir, MANIFEST_RELATIVE_PATH))).toBe(false);

    await runManifest(dir, 'write');
    expect(await runManifest(dir, 'check')).toMatchObject({ ok: true, status: 'up-to-date' });

    await writeFile(
      path.join(dir, 'src/commands/extra.ts'),
      `import { defineCommand } from '@sxnnyside/circe';
import { SlashCommandBuilder } from 'discord.js';

export default defineCommand({
  builder: new SlashCommandBuilder().setName('extra').setDescription('Extra'),
  async execute(ctx) {
    await ctx.interaction.reply('extra');
  },
});
`,
    );

    const stale = await runManifest(dir, 'check');
    expect(stale).toMatchObject({ ok: false, status: 'stale' });
    expect(stale.manifest.routes.map((route) => route.name)).toContain('/extra');
  });

  test('check never writes the file', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });
    await runManifest(dir, 'check');
    expect(existsSync(path.join(dir, '.circe'))).toBe(false);
  });
});
