import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { COMMANDS, helpText } from '../../src/cli/interface.js';

const SKILLS_DIR = path.join(
  import.meta.dirname,
  '..',
  '..',
  'templates',
  'shared',
  '.agents',
  'skills',
);
const EXPECTED_SKILLS = [
  'circe-add-module',
  'circe-diagnose-errors',
  'circe-project-conventions',
  'circe-verify-changes',
];

function readSkill(name: string): string {
  return readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
}

function frontmatter(source: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  expect(match).not.toBeNull();
  const fields: Record<string, string> = {};
  for (const line of (match?.[1] ?? '').split('\n')) {
    const separator = line.indexOf(':');
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

const documentedFlags = new Set(helpText({ color: false }).match(/--[a-z][a-z-]*/g));

describe('official agent skills', () => {
  test('ship exactly the expected set', () => {
    expect(readdirSync(SKILLS_DIR).sort()).toEqual(EXPECTED_SKILLS);
  });

  for (const name of EXPECTED_SKILLS) {
    describe(name, () => {
      const source = readSkill(name);

      test('has frontmatter whose name matches its folder, a description, and a contract revision', () => {
        const fields = frontmatter(source);
        expect(fields.name).toBe(name);
        expect((fields.description ?? '').length).toBeGreaterThan(40);
        expect(fields['circe-contract']).toBe('1');
      });

      test('only invokes circe subcommands that exist', () => {
        const codeSpans = [
          ...[...source.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((match) => match[1] as string),
          ...[...source.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] as string),
        ];
        const invoked = codeSpans
          .flatMap((span) => span.split('\n'))
          .map((line) => /^\s*circe ([a-z]+)/.exec(line)?.[1])
          .filter((command): command is string => command !== undefined);

        expect(invoked.length).toBeGreaterThan(0);
        for (const command of invoked) {
          expect(COMMANDS as readonly string[]).toContain(command);
        }
      });

      test('only references CLI flags that the help text documents', () => {
        const flags = source.match(/(?<![\w-])--[a-z][a-z-]*/g) ?? [];
        for (const flag of flags) {
          expect(documentedFlags.has(flag)).toBe(true);
        }
      });
    });
  }

  test('the verification gate runs the structured build and the manifest check', () => {
    const source = readSkill('circe-verify-changes');
    expect(source).toContain('circe build --format json');
    expect(source).toContain('circe manifest --check');
  });

  test('the error skill documents every structured error category', () => {
    const source = readSkill('circe-diagnose-errors');
    for (const category of [
      'config',
      'config-file',
      'module-validation',
      'discovery-conflict',
      'usage',
      'operational',
      'internal',
    ]) {
      expect(source).toContain(`\`${category}\``);
    }
  });
});
