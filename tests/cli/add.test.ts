import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { prepareApp } from '../../src/application/prepare-app.js';
import { runAdd } from '../../src/cli/add.js';
import { runInit } from '../../src/cli/init.js';
import { parseArgs } from '../../src/cli/interface.js';
import { createLogger } from '../../src/logging/logger.js';

const ADD_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-add');
let dir: string;
const originalEnv = { ...process.env };

beforeEach(async () => {
  await mkdir(ADD_ROOT, { recursive: true });
  dir = await mkdtemp(path.join(ADD_ROOT, 'test-'));
  process.env.DISCORD_TOKEN = 'test-token-valid-01234567890123456789';
  process.env.DISCORD_CLIENT_ID = '123456789012345678';
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(ADD_ROOT, { recursive: true, force: true });
});

describe('runAdd', () => {
  test('scaffolds a slash command with guildOnly guard and description', async () => {
    const result = await runAdd(dir, {
      kind: 'command',
      name: 'ban',
      description: 'Ban a disruptive member',
      guildOnly: true,
    });

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe(path.join('src', 'commands', 'ban.ts'));
    expect(existsSync(result.filePath)).toBe(true);

    const content = await readFile(result.filePath, 'utf8');
    expect(content).toContain('defineCommand');
    expect(content).toContain("setName('ban')");
    expect(content).toContain("setDescription('Ban a disruptive member')");
    expect(content).toContain('guards: [guildOnly]');
  });

  test('scaffolds a Discord event with canonical enum resolution and once flag', async () => {
    const result = await runAdd(dir, {
      kind: 'event',
      name: 'ready',
      once: true,
    });

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe(path.join('src', 'events', 'ready.ts'));

    const content = await readFile(result.filePath, 'utf8');
    expect(content).toContain('defineEvent');
    expect(content).toContain('name: Events.ClientReady');
    expect(content).toContain('once: true');
  });

  test('scaffolds a component handler with custom prefix', async () => {
    const result = await runAdd(dir, {
      kind: 'component',
      name: 'vote',
      prefix: 'vote:ballot:',
    });

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe(path.join('src', 'components', 'vote.ts'));

    const content = await readFile(result.filePath, 'utf8');
    expect(content).toContain('defineComponent');
    expect(content).toContain("prefix: 'vote:ballot:'");
  });

  test('scaffolds a modal handler', async () => {
    const result = await runAdd(dir, {
      kind: 'modal',
      name: 'report',
      prefix: 'report-modal:',
    });

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe(path.join('src', 'modals', 'report.ts'));

    const content = await readFile(result.filePath, 'utf8');
    expect(content).toContain('defineModal');
    expect(content).toContain("prefix: 'report-modal:'");
  });

  test('scaffolds an access control guard function', async () => {
    const result = await runAdd(dir, {
      kind: 'guard',
      name: 'moderator',
    });

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe(path.join('src', 'guards', 'moderator.ts'));

    const content = await readFile(result.filePath, 'utf8');
    expect(content).toContain('export function moderatorGuard(): Guard');
    // The router denies anything that is not exactly `true`, so the scaffold must allow with `true`.
    expect(content).toContain('return true;');
    expect(content).not.toContain('return undefined');
  });

  test('component and modal scaffolds reply with flags, not the deprecated ephemeral option', async () => {
    const component = await runAdd(dir, { kind: 'component', name: 'vote' });
    const modal = await runAdd(dir, { kind: 'modal', name: 'report' });

    for (const result of [component, modal]) {
      const content = await readFile(result.filePath, 'utf8');
      expect(content).toContain('flags: MessageFlags.Ephemeral');
      expect(content).not.toContain('ephemeral: true');
    }
  });

  test('escapes quotes in user text so the generated file stays valid', async () => {
    const result = await runAdd(dir, {
      kind: 'command',
      name: 'lat',
      description: "Bot's latency",
    });

    const content = await readFile(result.filePath, 'utf8');
    expect(content).toContain(".setDescription('Bot\\'s latency')");
  });

  test('refuses to overwrite existing files unless force is true', async () => {
    await runAdd(dir, { kind: 'command', name: 'stats' });

    expect(runAdd(dir, { kind: 'command', name: 'stats' })).rejects.toThrow('already exists');

    const forced = await runAdd(dir, {
      kind: 'command',
      name: 'stats',
      description: 'Overwritten stats',
      force: true,
    });
    expect(forced.created).toBe(true);
  });

  test('generated artifacts pass prepareApp module validation in a project', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });

    await runAdd(dir, { kind: 'command', name: 'echo' });
    await runAdd(dir, { kind: 'event', name: 'messageCreate' });
    await runAdd(dir, { kind: 'component', name: 'button', prefix: 'btn:test:' });
    await runAdd(dir, { kind: 'modal', name: 'feedback' });

    const logger = createLogger({ sink: () => {} });
    const { app } = await prepareApp(dir, logger);

    expect(app.commands.registry.size).toBe(2); // ping + echo
    expect(app.commands.registry.get('echo')).toBeDefined();
    expect(app.events.registry.size).toBe(1);
    expect(app.components.registry.size).toBe(1);
    expect(app.modals.registry.size).toBe(1);
  });
});

describe('parseArgs for add', () => {
  test('parses circe add command options and flags', () => {
    const parsed = parseArgs([
      'add',
      'command',
      'purge',
      '--description',
      'Purge messages',
      '--guild-only',
    ]);
    expect(parsed.kind).toBe('run');
    if (parsed.kind === 'run') {
      expect(parsed.command).toBe('add');
      expect(parsed.addArtifact).toBe('command');
      expect(parsed.addName).toBe('purge');
      expect(parsed.addDescription).toBe('Purge messages');
      expect(parsed.addGuildOnly).toBe(true);
    }
  });

  test('a flag is never taken as the value of the option before it', () => {
    const parsed = parseArgs(['add', 'command', 'purge', '--description', '--guild-only']);

    expect(parsed.kind === 'run' && parsed.addDescription).toBeUndefined();
    expect(parsed.kind === 'run' && parsed.addGuildOnly).toBe(true);
    expect(parsed.kind === 'run' && parsed.addName).toBe('purge');
  });

  test('accepts --name=value for value options', () => {
    const parsed = parseArgs(['add', 'component', 'vote', '--prefix=vote:', '--description=hi']);

    expect(parsed.kind === 'run' && parsed.addPrefix).toBe('vote:');
    expect(parsed.kind === 'run' && parsed.addDescription).toBe('hi');
  });

  test('parses circe add event flags', () => {
    const parsed = parseArgs(['add', 'event', 'ready', '--once']);
    expect(parsed.kind).toBe('run');
    if (parsed.kind === 'run') {
      expect(parsed.addArtifact).toBe('event');
      expect(parsed.addName).toBe('ready');
      expect(parsed.addOnce).toBe(true);
    }
  });
});
