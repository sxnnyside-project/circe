import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { Client, ClientEvents } from 'discord.js';
import { attachEvents, createEventHandler } from '../../../src/discord/events/dispatcher.js';
import { EventError } from '../../../src/discord/events/errors.js';
import { EventRegistry } from '../../../src/discord/events/registry.js';
import type { EventDefinition } from '../../../src/discord/events/types.js';
import { getCorrelationId } from '../../../src/logging/context.js';
import { createLogger, type LogEntry } from '../../../src/logging/logger.js';

function silentLogger(): { logger: ReturnType<typeof createLogger>; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

/** node:events' EventEmitter has the same on/once/emit surface discord.js's Client extends. */
function fakeClient(): Client {
  return new EventEmitter() as unknown as Client;
}

/**
 * Test events don't care about a real event's argument tuple — this builds
 * a loosely-typed handler so tests can call it with whatever arguments (or
 * none) are convenient, without fighting discord.js's per-event typing.
 */
function testHandler(
  definition: {
    name: keyof ClientEvents;
    once?: boolean;
    execute: (...args: unknown[]) => void | Promise<void>;
  },
  logger: ReturnType<typeof createLogger>,
): (...args: unknown[]) => void {
  return createEventHandler(definition as unknown as EventDefinition, logger) as unknown as (
    ...args: unknown[]
  ) => void;
}

describe('createEventHandler', () => {
  test("invokes the event's execute function with the emitted arguments", async () => {
    const { logger } = silentLogger();
    const received: unknown[] = [];
    const handler = testHandler(
      {
        name: 'guildCreate',
        execute: (...args) => {
          received.push(args);
        },
      },
      logger,
    );

    handler('arg-1', 'arg-2');
    await new Promise((resolve) => setImmediate(resolve));

    expect(received).toEqual([['arg-1', 'arg-2']]);
  });

  test('catches a thrown error instead of propagating it, and logs it', async () => {
    const { logger, entries } = silentLogger();
    const handler = testHandler(
      {
        name: 'guildCreate',
        execute: () => {
          throw new Error('listener failed');
        },
      },
      logger,
    );

    expect(() => handler()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  test('regression: a handler failure is logged as an EventError, not a generic CirceError', async () => {
    const { logger, entries } = silentLogger();
    const handler = testHandler(
      {
        name: 'guildCreate',
        execute: () => {
          throw new Error('listener failed');
        },
      },
      logger,
    );

    handler();
    await new Promise((resolve) => setImmediate(resolve));

    const errorEntry = entries.find((entry) => entry.level === 'error');
    expect(errorEntry?.metadata.error).toBeInstanceOf(EventError);
  });

  test('runs each invocation inside its own correlation context', async () => {
    const { logger } = silentLogger();
    const seen: (string | undefined)[] = [];
    const handler = testHandler(
      {
        name: 'guildCreate',
        execute: () => {
          seen.push(getCorrelationId());
        },
      },
      logger,
    );

    handler();
    handler();
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeDefined();
    expect(seen[0]).not.toBe(seen[1]);
  });
});

describe('attachEvents', () => {
  test('registers a non-once event with client.on', async () => {
    const client = fakeClient();
    const registry = new EventRegistry();
    let called = false;
    registry.register({
      name: 'guildCreate',
      execute: () => {
        called = true;
      },
    });

    const { logger } = silentLogger();
    attachEvents(client, registry, logger);

    client.emit('guildCreate' as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(called).toBe(true);
  });

  test('registers a once event so it only fires a single time', async () => {
    const client = fakeClient();
    const registry = new EventRegistry();
    let callCount = 0;
    registry.register({
      name: 'ready',
      once: true,
      execute: () => {
        callCount += 1;
      },
    });

    const { logger } = silentLogger();
    attachEvents(client, registry, logger);

    client.emit('ready' as never);
    client.emit('ready' as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(callCount).toBe(1);
  });

  test('one listener throwing does not stop another listener for a different event', async () => {
    const client = fakeClient();
    const registry = new EventRegistry();
    let otherCalled = false;

    registry.register({
      name: 'guildCreate',
      execute: () => {
        throw new Error('first listener failed');
      },
    });
    registry.register({
      name: 'guildDelete',
      execute: () => {
        otherCalled = true;
      },
    });

    const { logger } = silentLogger();
    attachEvents(client, registry, logger);

    client.emit('guildCreate' as never);
    client.emit('guildDelete' as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(otherCalled).toBe(true);
  });

  test('one listener throwing does not stop another listener for the same event', async () => {
    const client = fakeClient();
    const registry = new EventRegistry();
    let secondCalled = false;

    registry.register({
      name: 'guildCreate',
      execute: () => {
        throw new Error('first listener failed');
      },
    });
    registry.register({
      name: 'guildCreate',
      execute: () => {
        secondCalled = true;
      },
    });

    const { logger } = silentLogger();
    attachEvents(client, registry, logger);

    client.emit('guildCreate' as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(secondCalled).toBe(true);
  });
});
