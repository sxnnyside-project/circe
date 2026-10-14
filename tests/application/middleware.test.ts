import { describe, expect, test } from 'bun:test';
import { runWithMiddleware } from '../../src/application/middleware.js';
import { createLogger } from '../../src/logging/logger.js';

const ctx = {
  kind: 'command' as const,
  name: 'ping',
  logger: createLogger({ sink: () => {} }),
  correlationId: undefined,
};

describe('runWithMiddleware', () => {
  test('runs fn when no middleware is supplied', async () => {
    let called = false;
    await runWithMiddleware(
      undefined,
      () => ctx,
      async () => {
        called = true;
      },
    );
    expect(called).toBe(true);
  });

  test('never builds the context when no middleware is supplied — the hot-path allocation is skipped entirely', async () => {
    let contextBuilt = false;
    await runWithMiddleware(
      undefined,
      () => {
        contextBuilt = true;
        return ctx;
      },
      async () => {},
    );
    expect(contextBuilt).toBe(false);
  });

  test('runs before, then fn, then after, in order', async () => {
    const order: string[] = [];
    await runWithMiddleware(
      {
        before: async () => {
          order.push('before');
        },
        after: async () => {
          order.push('after');
        },
      },
      () => ctx,
      async () => {
        order.push('fn');
      },
    );
    expect(order).toEqual(['before', 'fn', 'after']);
  });

  test('still runs after when fn throws, then propagates the error', async () => {
    const order: string[] = [];
    await expect(
      runWithMiddleware(
        {
          after: async () => {
            order.push('after');
          },
        },
        () => ctx,
        async () => {
          order.push('fn');
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');
    expect(order).toEqual(['fn', 'after']);
  });

  test('still runs after when before throws, and fn never runs', async () => {
    const order: string[] = [];
    await expect(
      runWithMiddleware(
        {
          before: async () => {
            order.push('before');
            throw new Error('before boom');
          },
          after: async () => {
            order.push('after');
          },
        },
        () => ctx,
        async () => {
          order.push('fn');
        },
      ),
    ).rejects.toThrow('before boom');
    expect(order).toEqual(['before', 'after']);
  });

  test('runs after even when fn returns early', async () => {
    const order: string[] = [];
    await runWithMiddleware(
      {
        after: async () => {
          order.push('after');
        },
      },
      () => ctx,
      async () => {
        order.push('fn');
        return;
      },
    );
    expect(order).toEqual(['fn', 'after']);
  });
});
