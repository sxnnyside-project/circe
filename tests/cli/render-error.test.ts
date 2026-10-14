import { describe, expect, test } from 'bun:test';
import { exitCodeFor, renderError } from '../../src/cli/render-error.js';
import { ConfigError } from '../../src/config/errors.js';
import { CirceError } from '../../src/errors/circe-error.js';
import { DiscoveryConflictError } from '../../src/errors/discovery-conflict-error.js';
import { ModuleValidationError } from '../../src/errors/module-validation-error.js';

describe('renderError', () => {
  test('renders a ModuleValidationError as one ✗ block per issue, followed by a summary line', () => {
    const error = new ModuleValidationError('2 command module issue(s) found', {
      category: 'commands',
      issues: [
        { file: 'ban.ts', message: 'missing `builder`' },
        { file: 'kick.ts', message: 'missing `execute`' },
      ],
    });

    expect(renderError(error)).toBe(
      ['✗ ban.ts\n  missing `builder`', '✗ kick.ts\n  missing `execute`', '2 error(s) found.'].join(
        '\n\n',
      ),
    );
  });

  test('renders every ConfigError issue on its own line', () => {
    const error = new ConfigError('Invalid configuration: 2 issue(s) found', {
      issues: [
        { path: 'token', message: 'Required' },
        { path: 'clientId', message: 'Required' },
      ],
    });

    const rendered = renderError(error);
    expect(rendered).toContain('✗ ConfigError');
    expect(rendered).toContain('token: Required');
    expect(rendered).toContain('clientId: Required');
  });

  test("renders a DiscoveryConflictError's identity when present", () => {
    const error = new DiscoveryConflictError('Duplicate command name "ping"', {
      category: 'commands',
      reason: 'duplicate',
      identity: 'ping',
    });

    expect(renderError(error)).toBe(
      '✗ DiscoveryConflictError\n  Duplicate command name "ping"\n  identity: ping',
    );
  });

  test('falls back to the error name when no file is attached', () => {
    const error = new CirceError('Something unexpected happened');
    expect(renderError(error)).toBe('✗ CirceError\n  Something unexpected happened');
  });
});

describe('exitCodeFor', () => {
  test('returns 1 for an operational error', () => {
    const error = new CirceError('bad input', { operational: true });
    expect(exitCodeFor(error)).toBe(1);
  });

  test('returns 2 for a non-operational error', () => {
    const error = new CirceError('bug', { operational: false });
    expect(exitCodeFor(error)).toBe(2);
  });
});
