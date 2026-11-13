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

  test('toJSON is cycle-safe and handles circular cause chains without stack overflow', () => {
    const errA = new CirceError('Error A');
    const errB = new CirceError('Error B', { cause: errA });
    // Introduce circular reference
    (errA as { cause: unknown }).cause = errB;

    expect(() => errA.toJSON()).not.toThrow();
    const serialized = JSON.parse(JSON.stringify(errA.toJSON()));
    expect(serialized.message).toBe('Error A');
    expect(serialized.cause.message).toBe('Error B');
    expect(serialized.cause.cause).toBe('[CircularCause]');
  });

  test('toJSON safely converts BigInts in metadata to strings', () => {
    const error = new CirceError('discord error', {
      metadata: { guildId: 123456789012345678n, shardId: 2n },
    });

    const json = error.toJSON();
    expect(json.metadata).toEqual({ guildId: '123456789012345678', shardId: '2' });
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  test('toJSON handles AggregateError preserving child errors', () => {
    const child1 = new Error('child 1');
    const child2 = new CirceError('child 2', { metadata: { code: 'ERR_CHILD' } });
    const agg = new AggregateError([child1, child2], 'multiple failures');
    const error = new CirceError('operation failed', { cause: agg });

    const serialized = JSON.parse(JSON.stringify(error));
    expect(serialized.cause.name).toBe('AggregateError');
    expect(Array.isArray(serialized.cause.errors)).toBe(true);
    expect(serialized.cause.errors[0].message).toBe('child 1');
    expect(serialized.cause.errors[1].message).toBe('child 2');
    expect(serialized.cause.errors[1].metadata.code).toBe('ERR_CHILD');
  });
});

describe('normalizeError', () => {
  test('passes CirceError instances through unchanged', () => {
    const original = new CirceError('already normalized');
    expect(normalizeError(original)).toBe(original);
  });

  test('wraps a plain Error, preserving it as cause, marking unexpected, and recording originalName', () => {
    const original = new TypeError('cannot read property of undefined');
    const normalized = normalizeError(original);
    expect(normalized).toBeInstanceOf(CirceError);
    expect(normalized.message).toBe('cannot read property of undefined');
    expect(normalized.cause).toBe(original);
    expect(normalized.operational).toBe(false);
    expect(normalized.metadata.originalName).toBe('TypeError');
  });

  test('wraps a non-Error thrown value using the fallback message', () => {
    const normalized = normalizeError('just a string', 'fallback message');
    expect(normalized.message).toBe('fallback message');
    expect(normalized.metadata.originalValue).toBe('just a string');
    expect(normalized.operational).toBe(false);
  });
});
