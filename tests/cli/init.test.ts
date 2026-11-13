import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareApp } from '../../src/application/prepare-app.js';
import { detectPackageManager, renderInitResult, runInit } from '../../src/cli/init.js';
import { parseArgs } from '../../src/cli/interface.js';
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
        '.agents/skills/circe-add-module/SKILL.md',
        '.agents/skills/circe-diagnose-errors/SKILL.md',
        '.agents/skills/circe-project-conventions/SKILL.md',
        '.agents/skills/circe-verify-changes/SKILL.md',
        '.env.example',
        '.gitignore',
        'README.md',
        'circe.config.ts',
        'package.json',
        'src/commands/ping.ts',
        'src/config.ts',
        'tsconfig.json',
      ].sort(),
    );
    expect(result.skipped).toEqual([]);
    expect(result.runtime).toBe('bun');
    expect(result.template).toBe('minimal');

    const config = await readFile(path.join(dir, 'circe.config.ts'), 'utf8');
    expect(config).toContain('defineCirceConfig');

    const command = await readFile(path.join(dir, 'src/commands/ping.ts'), 'utf8');
    expect(command).toContain('defineCommand');
  });

  test('scaffolds a Deno-first project with deno.json and zero node/npm files', async () => {
    const result = await runInit(dir, { runtime: 'deno', template: 'minimal' });

    expect([...result.created].sort()).toEqual(
      [
        '.agents/skills/circe-add-module/SKILL.md',
        '.agents/skills/circe-diagnose-errors/SKILL.md',
        '.agents/skills/circe-project-conventions/SKILL.md',
        '.agents/skills/circe-verify-changes/SKILL.md',
        '.env.example',
        '.gitignore',
        'README.md',
        'circe.config.ts',
        'deno.json',
        'src/commands/ping.ts',
        'src/config.ts',
      ].sort(),
    );
    expect(result.created).not.toContain('package.json');
    expect(result.created).not.toContain('tsconfig.json');

    const denoConfig = await readFile(path.join(dir, 'deno.json'), 'utf8');
    expect(denoConfig).toContain('npm:@sxnnyside/circe');
    expect(denoConfig).toContain('deno run -A --watch');
  });

  test('scaffolds the official agent skills into every template tier and runtime', async () => {
    const result = await runInit(dir, { runtime: 'node', template: 'advanced' });

    for (const skill of [
      'circe-add-module',
      'circe-diagnose-errors',
      'circe-project-conventions',
      'circe-verify-changes',
    ]) {
      expect(result.created).toContain(`.agents/skills/${skill}/SKILL.md`);
    }
  });

  test('scaffolds standard template with components, ready event, error boundary, and i18n', async () => {
    const result = await runInit(dir, { runtime: 'node', template: 'standard' });

    expect(result.created).toContain('src/commands/help.ts');
    expect(result.created).toContain('src/components/action-button.ts');
    expect(result.created).toContain('src/events/ready.ts');
    expect(result.created).toContain('src/error.ts');
    expect(result.created).toContain('src/localization.ts');
    expect(result.created).toContain('src/middleware.ts');
    expect(result.created).toContain('package.json');

    const errorBoundary = await readFile(path.join(dir, 'src/error.ts'), 'utf8');
    expect(errorBoundary).toContain('defineErrorBoundary');
  });

  test('scaffolds advanced template with command groups, context menus, modals, pagination and Dockerfile', async () => {
    const result = await runInit(dir, { runtime: 'bun', template: 'advanced' });

    expect(result.created).toContain('src/command-groups/admin/_group.ts');
    expect(result.created).toContain('src/command-groups/admin/kick.ts');
    expect(result.created).toContain('src/context-menus/users/avatar.ts');
    expect(result.created).toContain('src/context-menus/messages/bookmark.ts');
    expect(result.created).toContain('src/modals/feedback.ts');
    expect(result.created).toContain('src/components/pagination.ts');
    expect(result.created).toContain('Dockerfile');

    const dockerfile = await readFile(path.join(dir, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('oven/bun');
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

  test('outputs Deno tasks when runtime is deno', () => {
    const result = {
      created: ['deno.json', 'circe.config.ts'],
      skipped: [],
      runtime: 'deno' as const,
      template: 'minimal' as const,
    };

    const output = renderInitResult(result);
    expect(output).toContain('deno task dev');
    expect(output).not.toContain('npm install');
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

describe('CLI argument parsing for init', () => {
  test('parses --runtime and --template options', () => {
    const parsed = parseArgs(['init', 'my-bot', '--runtime', 'deno', '--template', 'advanced']);
    expect(parsed.kind).toBe('run');
    if (parsed.kind === 'run') {
      expect(parsed.command).toBe('init');
      expect(parsed.targetDir).toBe('my-bot');
      expect(parsed.runtime).toBe('deno');
      expect(parsed.template).toBe('advanced');
    }
  });

  test('parses template shortcut flags like --standard and --advanced', () => {
    const parsed = parseArgs(['init', '--advanced', '-r', 'bun']);
    expect(parsed.kind).toBe('run');
    if (parsed.kind === 'run') {
      expect(parsed.template).toBe('advanced');
      expect(parsed.runtime).toBe('bun');
    }
  });
});
