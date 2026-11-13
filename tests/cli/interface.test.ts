import { describe, expect, test } from 'bun:test';
import {
  COMMANDS,
  completionScript,
  didYouMean,
  helpText,
  isShell,
  parseArgs,
  readVersion,
  SHELLS,
  wantsJson,
} from '../../src/cli/interface.js';

describe('cli interface', () => {
  test('readVersion matches package.json semver', () => {
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('help lists every command', () => {
    for (const command of COMMANDS) expect(helpText()).toContain(command);
  });

  test('every shell has a completion script naming every command', () => {
    for (const shell of SHELLS) {
      for (const command of COMMANDS) expect(completionScript(shell)).toContain(command);
    }
  });

  test('isShell rejects unknown shells', () => {
    expect(isShell('zsh')).toBe(true);
    expect(isShell('tcsh')).toBe(false);
    expect(isShell(undefined)).toBe(false);
  });
});

describe('parseArgs', () => {
  test('--help and --version win over a command, so `init --help` never scaffolds', () => {
    expect(parseArgs(['init', '--help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['start', '-h'])).toEqual({ kind: 'help' });
    expect(parseArgs(['dev', '--version'])).toEqual({ kind: 'version' });
    expect(parseArgs(['-V', 'start'])).toEqual({ kind: 'version' });
  });

  test('help and version also work as words', () => {
    expect(parseArgs(['help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['version'])).toEqual({ kind: 'version' });
  });

  test('a plain command is returned with the json flag', () => {
    expect(parseArgs(['init', '--json'])).toEqual({ kind: 'run', command: 'init', json: true });
    expect(parseArgs([])).toEqual({ kind: 'run', command: undefined, json: false });
  });

  test('--format json is equivalent to --json, in either spelling', () => {
    expect(parseArgs(['build', '--format', 'json'])).toMatchObject({
      command: 'build',
      json: true,
    });
    expect(parseArgs(['build', '--format=json'])).toMatchObject({ command: 'build', json: true });
    expect(parseArgs(['build', '--format', 'text'])).toMatchObject({
      command: 'build',
      json: false,
    });
  });

  test('an unknown --format value is reported instead of silently ignored', () => {
    expect(parseArgs(['build', '--format', 'yaml'])).toMatchObject({ invalidFormat: 'yaml' });
    expect(parseArgs(['build', '--format'])).toMatchObject({ invalidFormat: '' });
    expect(parseArgs(['build'])).toMatchObject({ invalidFormat: undefined });
  });

  test('flag values are never mistaken for positionals', () => {
    expect(parseArgs(['init', '--runtime', 'deno', '--standard'])).toMatchObject({
      command: 'init',
      targetDir: undefined,
      runtime: 'deno',
      template: 'standard',
    });
    expect(parseArgs(['init', 'my-bot', '--template', 'advanced'])).toMatchObject({
      targetDir: 'my-bot',
      template: 'advanced',
    });
    expect(
      parseArgs(['add', 'command', 'ban', '--description', 'Ban', '--format', 'json']),
    ).toMatchObject({
      addArtifact: 'command',
      addName: 'ban',
      addDescription: 'Ban',
      json: true,
    });
  });

  test('manifest --check is recognized only for the manifest command', () => {
    expect(parseArgs(['manifest', '--check'])).toMatchObject({ manifestCheck: true });
    expect(parseArgs(['manifest'])).toMatchObject({ manifestCheck: undefined });
    expect(parseArgs(['build', '--check'])).toMatchObject({ manifestCheck: undefined });
  });

  test('wantsJson recognizes every JSON spelling', () => {
    expect(wantsJson(['routes', '--json'])).toBe(true);
    expect(wantsJson(['routes', '--format', 'json'])).toBe(true);
    expect(wantsJson(['routes', '--format=json'])).toBe(true);
    expect(wantsJson(['routes'])).toBe(false);
    expect(wantsJson(['routes', '--format', 'text'])).toBe(false);
  });

  test('completions carries its shell argument', () => {
    expect(parseArgs(['completions', 'zsh'])).toEqual({
      kind: 'completions',
      shell: 'zsh',
      json: false,
    });
    expect(parseArgs(['completions'])).toMatchObject({ kind: 'completions', shell: undefined });
  });
});

describe('didYouMean', () => {
  test('suggests closest match for typos within distance 2', () => {
    expect(didYouMean('rotes', COMMANDS)).toBe('routes');
    expect(didYouMean('docto', COMMANDS)).toBe('doctor');
    expect(didYouMean('buid', COMMANDS)).toBe('build');
    expect(didYouMean('strt', COMMANDS)).toBe('start');
  });

  test('returns undefined for distant unrecognized strings', () => {
    expect(didYouMean('completelyunrelated', COMMANDS)).toBeUndefined();
  });
});

describe('helpText styling', () => {
  test('formats with ANSI codes when color is enabled', () => {
    const colored = helpText({ color: true });
    expect(colored).toContain('\x1b[1mCOMMANDS\x1b[0m');
    expect(colored).toContain('\x1b[36minit\x1b[0m');
  });

  test('formats plain text when color is disabled', () => {
    const plain = helpText({ color: false });
    expect(plain).not.toContain('\x1b[');
    expect(plain).toContain('COMMANDS');
    expect(plain).toContain('init');
  });
});
