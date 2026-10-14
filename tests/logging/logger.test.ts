import { describe, expect, test } from 'bun:test';
import { withCorrelationId } from '../../src/logging/context.js';
import { createLogger, type LogEntry } from '../../src/logging/logger.js';

function collectingLogger(overrides: Parameters<typeof createLogger>[0] = {}) {
  const entries: LogEntry[] = [];
  const logger = createLogger({ ...overrides, sink: (entry) => entries.push(entry) });
  return { logger, entries };
}

describe('createLogger', () => {
  test('writes entries for each level', () => {
    const { logger, entries } = collectingLogger({ level: 'debug' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(entries.map((entry) => entry.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });

  test('filters entries below the configured level', () => {
    const { logger, entries } = collectingLogger({ level: 'warn' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(entries.map((entry) => entry.level)).toEqual(['warn', 'error']);
  });

  test('merges structured metadata into each entry', () => {
    const { logger, entries } = collectingLogger();

    logger.info('hello', { userId: '123' });

    expect(entries[0]?.message).toBe('hello');
    expect(entries[0]?.metadata).toEqual({ userId: '123' });
  });

  test('child() carries base metadata into every subsequent entry', () => {
    const { logger, entries } = collectingLogger();
    const child = logger.child({ component: 'commands' });

    child.info('loaded', { count: 3 });

    expect(entries[0]?.metadata).toEqual({ component: 'commands', count: 3 });
  });

  test('child metadata does not leak back into the parent logger', () => {
    const { logger, entries } = collectingLogger();
    logger.child({ component: 'commands' });

    logger.info('parent entry');

    expect(entries[0]?.metadata).toEqual({});
  });

  test('automatically attaches the active correlation ID', () => {
    const { logger, entries } = collectingLogger();

    withCorrelationId(() => {
      logger.info('within context');
    }, 'corr-1');

    expect(entries[0]?.correlationId).toBe('corr-1');
  });

  test('has no correlation ID outside any context', () => {
    const { logger, entries } = collectingLogger();
    logger.info('no context');
    expect(entries[0]?.correlationId).toBeUndefined();
  });
});

describe('error serialization', () => {
  test('writes a native Error with its message and stack instead of an empty object', () => {
    const lines: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      lines.push(chunk);
      return true;
    }) as typeof process.stderr.write;
    try {
      createLogger({ environment: 'production' }).error('failed', {
        error: new Error('disk full', { cause: new Error('quota') }),
      });
    } finally {
      process.stderr.write = original;
    }

    const entry = JSON.parse(lines.join(''));
    expect(entry.metadata.error.message).toBe('disk full');
    expect(entry.metadata.error.stack).toContain('disk full');
    expect(entry.metadata.error.cause.message).toBe('quota');
  });
});
