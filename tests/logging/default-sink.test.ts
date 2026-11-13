import { describe, expect, test } from 'bun:test';
import { createLogger } from '../../src/logging/logger.js';

/**
 * Regression coverage for the default sink's JSON serialization: it must
 * never throw on values `JSON.stringify` chokes on (circular references,
 * BigInt, throwing getters) — a logger that crashes while reporting a failure is worse than
 * one that reports a degraded entry.
 */
function captureStdout(fn: () => void): string {
  const original = process.stdout.write.bind(process.stdout);
  let output = '';
  process.stdout.write = ((chunk: string) => {
    output += chunk;
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stdout.write = original;
  }

  return output;
}

describe('default sink', () => {
  test('does not throw on a circular metadata value, in either environment format', () => {
    const circular: Record<string, unknown> = { name: 'circular' };
    circular.self = circular;

    const prodLogger = createLogger({ environment: 'production' });
    const devLogger = createLogger({ environment: 'development' });

    expect(() =>
      captureStdout(() => prodLogger.info('has a circular ref', { circular })),
    ).not.toThrow();
    expect(() =>
      captureStdout(() => devLogger.info('has a circular ref', { circular })),
    ).not.toThrow();
  });

  test('still writes a usable entry when metadata is circular', () => {
    const circular: Record<string, unknown> = { name: 'circular' };
    circular.self = circular;

    const logger = createLogger({ environment: 'production' });
    const output = captureStdout(() => logger.info('degraded but present', { circular }));

    const parsed = JSON.parse(output.trim());
    expect(parsed.message).toBe('degraded but present');
    expect(parsed.metadata.circular.self).toBe('[Circular]');
  });

  test('does not throw on a BigInt metadata value and serializes it as string', () => {
    const logger = createLogger({ environment: 'production' });
    const output = captureStdout(() =>
      logger.info('has a snowflake', { snowflake: 123456789012345678n }),
    );
    const parsed = JSON.parse(output.trim());
    expect(parsed.metadata.snowflake).toBe('123456789012345678');
  });

  test('does not crash when metadata has a property with a throwing getter', () => {
    const evil = {
      get boom(): string {
        throw new Error('Explosive getter');
      },
    };

    const logger = createLogger({ environment: 'production' });
    expect(() => captureStdout(() => logger.info('evil metadata', { evil }))).not.toThrow();
  });
});
