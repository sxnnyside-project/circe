import { describe, expect, test } from 'bun:test';
import {
  generateCorrelationId,
  getCorrelationId,
  getParentCorrelationId,
  withCorrelationId,
} from '../../src/logging/context.js';

describe('correlation context', () => {
  test('generateCorrelationId returns unique values', () => {
    const a = generateCorrelationId();
    const b = generateCorrelationId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  test('getCorrelationId is undefined outside any context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  test('withCorrelationId makes the ID available inside the callback', () => {
    withCorrelationId(() => {
      expect(getCorrelationId()).toBe('op-1');
    }, 'op-1');
  });

  test('an explicit ID is used verbatim', () => {
    withCorrelationId(() => {
      expect(getCorrelationId()).toBe('explicit-id');
    }, 'explicit-id');
  });

  test('an ID is auto-generated when none is provided', () => {
    withCorrelationId(() => {
      expect(getCorrelationId()).toBeDefined();
    });
  });

  test('nested operations get their own ID and record the parent', () => {
    withCorrelationId(() => {
      const outerId = getCorrelationId();
      withCorrelationId(() => {
        expect(getCorrelationId()).not.toBe(outerId);
        expect(getParentCorrelationId()).toBe(outerId);
      }, 'inner-id');
    }, 'outer-id');
  });

  test('the context does not leak after the callback returns', () => {
    withCorrelationId(() => {
      /* noop */
    }, 'scoped-id');
    expect(getCorrelationId()).toBeUndefined();
  });

  test("concurrent async operations do not see each other's correlation ID", async () => {
    const observed: Record<string, string | undefined> = {};

    async function operation(name: string, delayMs: number): Promise<void> {
      await withCorrelationId(async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        observed[name] = getCorrelationId();
      }, `id-${name}`);
    }

    await Promise.all([operation('a', 10), operation('b', 1)]);

    expect(observed.a).toBe('id-a');
    expect(observed.b).toBe('id-b');
  });
});
