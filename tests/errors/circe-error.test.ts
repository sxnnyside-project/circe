import { describe, expect, test } from 'bun:test';
import { CirceError } from '../../src/errors/circe-error.js';
import { normalizeError } from '../../src/errors/normalize-error.js';
import { withCorrelationId } from '../../src/logging/context.js';

describe('CirceError', () => {
  test('defaults to operational and carries metadata', () => {
    const error = new CirceError('something failed', { metadata: { foo: 'bar' } });
    expect(error.operational).toBe(true);
    expect(error.metadata).toEqual({ foo: 'bar' });
    expect(error.message).toBe('something failed');
  });

  test('preserves a cause', () => {
    const cause = new Error('root cause');
    const error = new CirceError('wrapped', { cause });
    expect(error.cause).toBe(cause);
  });

  test('captures the active correlation ID automatically', () => {
    withCorrelationId(() => {
      const error = new CirceError('boom');
      expect(error.correlationId).toBeDefined();
    }, 'fixed-id');
  });

  test('has no correlation ID outside any context', () => {
    const error = new CirceError('boom');
    expect(error.correlationId).toBeUndefined();
  });

  test('regression: JSON.stringify would otherwise drop message/stack (non-enumerable on Error)', () => {
    const error = new CirceError('something failed', { metadata: { foo: 'bar' } });

    // Sanity check the underlying JS behavior this test guards against:
    // a plain Error serializes to "{}" because message/stack aren't enumerable.
    expect(JSON.stringify(new Error('plain'))).toBe('{}');

    const serialized = JSON.parse(JSON.stringify(error));
    expect(serialized.message).toBe('something failed');
    expect(serialized.metadata).toEqual({ foo: 'bar' });
    expect(typeof serialized.stack).toBe('string');
  });

  test('toJSON serializes an Error cause instead of dropping it', () => {
    const cause = new Error('root cause');
    const error = new CirceError('wrapped', { cause });

    const serialized = JSON.parse(JSON.stringify(error));
    expect(serialized.cause.message).toBe('root cause');
  });

  test('toJSON recursively serializes a CirceError cause via its own toJSON', () => {
    const inner = new CirceError('inner failure', { metadata: { step: 1 } });
    const outer = new CirceError('outer failure', { cause: inner });

    const serialized = JSON.parse(JSON.stringify(outer));
    expect(serialized.cause.message).toBe('inner failure');
    expect(serialized.cause.metadata).toEqual({ step: 1 });
  });
});

describe('normalizeError', () => {
  test('passes CirceError instances through unchanged', () => {
    const original = new CirceError('already normalized');
    expect(normalizeError(original)).toBe(original);
  });

  test('wraps a plain Error, preserving it as cause and marking it unexpected', () => {
    const original = new Error('plain failure');
    const normalized = normalizeError(original);
    expect(normalized).toBeInstanceOf(CirceError);
    expect(normalized.message).toBe('plain failure');
    expect(normalized.cause).toBe(original);
    expect(normalized.operational).toBe(false);
  });

  test('wraps a non-Error thrown value using the fallback message', () => {
    const normalized = normalizeError('just a string', 'fallback message');
    expect(normalized.message).toBe('fallback message');
    expect(normalized.metadata.originalValue).toBe('just a string');
    expect(normalized.operational).toBe(false);
  });
});
