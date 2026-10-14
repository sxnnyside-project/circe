import { describe, expect, test } from 'bun:test';
import {
  COMMANDS,
  completionScript,
  helpText,
  isShell,
  parseArgs,
  readVersion,
  SHELLS,
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

  test('completions carries its shell argument', () => {
    expect(parseArgs(['completions', 'zsh'])).toEqual({
      kind: 'completions',
      shell: 'zsh',
      json: false,
    });
    expect(parseArgs(['completions'])).toMatchObject({ kind: 'completions', shell: undefined });
  });
});
