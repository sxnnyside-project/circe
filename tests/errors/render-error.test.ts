import { describe, expect, test } from 'bun:test';
import { ConfigError } from '../../src/config/errors.js';
import { CirceError } from '../../src/errors/circe-error.js';
import { DiscoveryConflictError } from '../../src/errors/discovery-conflict-error.js';
import { ModuleValidationError } from '../../src/errors/module-validation-error.js';
import {
  exitCodeFor,
  renderError,
  renderErrorJson,
  renderUsageErrorJson,
  toStructuredError,
} from '../../src/errors/render-error.js';

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
    const error = new CirceError('fatal assertion', { operational: false });
    expect(exitCodeFor(error)).toBe(2);
  });
});

describe('toStructuredError', () => {
  test('unrolls ModuleValidationError issues with file and category', () => {
    const report = toStructuredError(
      new ModuleValidationError('2 command module issue(s) found', {
        category: 'commands',
        issues: [
          { file: 'ban.ts', message: 'missing `builder`' },
          { file: 'kick.ts', message: 'missing `execute`' },
        ],
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.error.category).toBe('module-validation');
    expect(report.error.exitCode).toBe(1);
    expect(report.error.issues).toEqual([
      { file: 'ban.ts', message: 'missing `builder`' },
      { file: 'kick.ts', message: 'missing `execute`' },
    ]);
    expect(report.error.metadata).toEqual({ category: 'commands' });
  });

  test('unrolls ConfigError issues with dotted paths', () => {
    const report = toStructuredError(
      new ConfigError('Invalid configuration: 1 issue(s) found', {
        issues: [{ path: 'http.publicKey', message: 'Required' }],
      }),
    );

    expect(report.error.category).toBe('config');
    expect(report.error.issues).toEqual([{ path: 'http.publicKey', message: 'Required' }]);
  });

  test('exposes the conflicting identity of a DiscoveryConflictError', () => {
    const report = toStructuredError(
      new DiscoveryConflictError('Duplicate command name "ping"', {
        category: 'commands',
        reason: 'duplicate',
        identity: 'ping',
      }),
    );

    expect(report.error.category).toBe('discovery-conflict');
    expect(report.error.identity).toBe('ping');
    expect(report.error.issues).toEqual([]);
  });

  test('attributes the error to metadata.file and classifies ConfigFile* errors', () => {
    class ConfigFileNotFoundError extends CirceError {}
    const report = toStructuredError(
      new ConfigFileNotFoundError('circe.config.ts not found', {
        metadata: { file: '/p/circe.config.ts' },
      }),
    );

    expect(report.error.category).toBe('config-file');
    expect(report.error.file).toBe('/p/circe.config.ts');
  });

  test('operational errors omit the stack; internal defects carry it with exit code 2', () => {
    const operational = toStructuredError(new CirceError('bad input'));
    expect(operational.error.category).toBe('operational');
    expect(operational.error.stack).toBeUndefined();

    const internal = toStructuredError(new CirceError('assertion', { operational: false }));
    expect(internal.error.category).toBe('internal');
    expect(internal.error.exitCode).toBe(2);
    expect(typeof internal.error.stack).toBe('string');
  });

  test('never throws on BigInt metadata and round-trips through JSON', () => {
    const error = new CirceError('snowflake failure', {
      metadata: { userId: 123456789012345678n },
    });

    const parsed = JSON.parse(renderErrorJson(error));
    expect(parsed.error.metadata.userId).toBe('123456789012345678');
    expect(parsed.ok).toBe(false);
  });
});

describe('renderUsageErrorJson', () => {
  test('produces a usage report with exit code 2 and an optional suggestion', () => {
    const parsed = JSON.parse(renderUsageErrorJson('unknown command: rotes', 'routes'));

    expect(parsed).toMatchObject({
      ok: false,
      error: {
        name: 'UsageError',
        category: 'usage',
        exitCode: 2,
        operational: true,
        suggestion: 'routes',
      },
    });
  });

  test('omits suggestion when none is given', () => {
    const parsed = JSON.parse(renderUsageErrorJson('missing shell'));
    expect('suggestion' in parsed.error).toBe(false);
  });
});
