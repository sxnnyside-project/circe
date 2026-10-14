import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderInitResult, runInit } from '../../src/cli/init.js';

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

describe('renderInitResult', () => {
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
