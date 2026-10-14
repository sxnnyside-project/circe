import { describe, expect, spyOn, test } from 'bun:test';
import { type AddressInfo, createServer } from 'node:net';
import { Events, Partials, SlashCommandBuilder } from 'discord.js';
import { createCirce } from '../../src/application/app.js';
import type { CommandRest } from '../../src/discord/commands/registration.js';
import { createLogger, type LogEntry } from '../../src/logging/logger.js';

function fakeChatInputInteraction(commandName: string) {
  return {
    commandName,
    deferred: false,
    replied: false,
    guild: { id: 'guild-1' },
    member: null,
    user: { id: 'user-1', username: 'tester' },
    locale: 'es-ES',
    isChatInputCommand: () => true,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isAutocomplete: () => false,
    isModalSubmit: () => false,
    reply: async () => {},
    followUp: async () => {},
  };
}

function fakeButtonInteraction(customId: string) {
  return {
    customId,
    deferred: false,
    replied: false,
    guild: { id: 'guild-1' },
    member: null,
    user: { id: 'user-1', username: 'tester' },
    isChatInputCommand: () => false,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isAutocomplete: () => false,
    isModalSubmit: () => false,
    reply: async () => {},
    followUp: async () => {},
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** Asks the OS for an unused port, then releases it for the test to bind. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function silentLogger() {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

function stubRest(): CommandRest {
  return { put: async () => [] };
}

const baseConfig = { token: 'test-token', clientId: 'test-client-id' };

function testApp(options: { handleProcessSignals?: boolean } = {}) {
  const { logger } = silentLogger();
  return createCirce({
    config: baseConfig,
    intents: [],
    logger,
    handleProcessSignals: options.handleProcessSignals ?? false,
    autoLogin: false,
    rest: stubRest(),
  });
}

describe('createCirce', () => {
  test('starts in the created state and exposes config', () => {
    const app = testApp();
    expect(app.state).toBe('created');
    expect(app.config).toEqual(baseConfig);
  });

  test('exposes a real discord.js client, command registry, and event registry', () => {
    const app = testApp();
    expect(app.client).toBeDefined();
    expect(app.commands.registry.size).toBe(0);
    expect(app.events.registry.size).toBe(0);
  });

  test('start() transitions the app to running', async () => {
    const app = testApp();
    await app.start();
    expect(app.state).toBe('running');
    await app.stop();
  });

  test('stop() transitions the app to stopped and is idempotent', async () => {
    const app = testApp();
    await app.start();
    await app.stop();
    expect(app.state).toBe('stopped');

    await expect(app.stop()).resolves.toBeUndefined();
    expect(app.state).toBe('stopped');
  });

  test('regression: stop() awaits client.destroy() rather than resolving before it settles', async () => {
    const app = testApp();
    await app.start();

    let destroyResolved = false;
    const originalDestroy = app.client.destroy.bind(app.client);
    app.client.destroy = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      destroyResolved = true;
      return originalDestroy();
    }) as typeof app.client.destroy;

    await app.stop();
    expect(destroyResolved).toBe(true);
  });

  test('onStart/onStop hooks run around the app lifecycle', async () => {
    const app = testApp();
    const calls: string[] = [];

    app.onStart(() => {
      calls.push('start');
    });
    app.onStop(() => {
      calls.push('stop');
    });

    await app.start();
    expect(calls).toEqual(['start']);
    await app.stop();
    expect(calls).toEqual(['start', 'stop']);
  });

  test('regression: onStart hooks run before login and before command registration', async () => {
    const order: string[] = [];
    const rest: CommandRest = {
      put: async () => {
        order.push('register');
        return [];
      },
    };

    const { logger } = silentLogger();
    const app = createCirce({
      config: baseConfig,
      intents: [],
      logger,
      handleProcessSignals: false,
      rest,
    });

    app.client.login = (async (token: string) => {
      order.push('login');
      return token;
    }) as typeof app.client.login;

    app.onStart(() => {
      order.push('consumer-hook');
    });

    await app.start();
    expect(order).toEqual(['consumer-hook', 'login', 'register']);
    await app.stop();
  });

  test('regression: onStop hooks run after the client is destroyed', async () => {
    const app = testApp();
    const order: string[] = [];

    const originalDestroy = app.client.destroy.bind(app.client);
    app.client.destroy = (async () => {
      order.push('destroy');
      return originalDestroy();
    }) as typeof app.client.destroy;

    app.onStop(() => {
      order.push('consumer-hook');
    });

    await app.start();
    await app.stop();
    expect(order).toEqual(['destroy', 'consumer-hook']);
  });

  test('a failing start hook propagates and leaves the app stopped', async () => {
    const app = testApp();
    app.onStart(() => {
      throw new Error('dependency unavailable');
    });

    await expect(app.start()).rejects.toThrow('dependency unavailable');
    expect(app.state).toBe('stopped');
  });

  test('logs start and stop transitions', async () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ sink: (entry) => entries.push(entry) });
    const app = createCirce({
      config: baseConfig,
      intents: [],
      logger,
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
    });

    await app.start();
    await app.stop();

    const messages = entries.map((entry) => entry.message);
    expect(messages).toContain('Circe application started');
    expect(messages).toContain('Circe application stopped');
  });

  test('registers commands automatically on start using the injected REST client', async () => {
    const puts: unknown[] = [];
    const rest: CommandRest = {
      put: async (_route, options) => {
        puts.push(options.body);
        return [];
      },
    };

    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest,
    });

    await app.start();
    expect(puts).toHaveLength(1);
    await app.stop();
  });

  test('regression: onCommandError passed to createCirce is wired through to the live router', async () => {
    let called = false;
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      onCommandError: () => {
        called = true;
      },
    });
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('broken').setDescription('broken'),
      execute: () => {
        throw new Error('boom');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeChatInputInteraction('broken') as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(called).toBe(true);
    await app.stop();
  });

  test('regression: onComponentError passed to createCirce is wired through to the live router', async () => {
    let called = false;
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      onComponentError: () => {
        called = true;
      },
    });
    app.components.registry.register({
      prefix: 'crate:save:',
      execute: () => {
        throw new Error('boom');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeButtonInteraction('crate:save:1') as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(called).toBe(true);
    await app.stop();
  });

  test('regression: middleware passed to createCirce runs before/after around a live command interaction', async () => {
    const order: string[] = [];
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      middleware: {
        before: (ctx) => {
          order.push(`before:${ctx.kind}:${ctx.name}`);
        },
        after: (ctx) => {
          order.push(`after:${ctx.kind}:${ctx.name}`);
        },
      },
    });
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('ping').setDescription('ping'),
      execute: () => {
        order.push('execute');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeChatInputInteraction('ping') as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(order).toEqual(['before:command:ping', 'execute', 'after:command:ping']);
    await app.stop();
  });

  test("regression: i18n resolver passed to createCirce resolves ctx.t using the interaction's locale", async () => {
    let capturedLocale: string | undefined;
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      i18n: {
        resolve: (key, locale) => {
          capturedLocale = locale;
          return `[${locale}] ${key}`;
        },
      },
    });

    let translated: string | undefined;
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('ping').setDescription('ping'),
      execute: (ctx) => {
        translated = ctx.t('greeting.hello');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeChatInputInteraction('ping') as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(capturedLocale).toBe('es-ES');
    expect(translated).toBe('[es-ES] greeting.hello');
    await app.stop();
  });

  test('ctx.t falls back to returning the key verbatim when no i18n resolver is configured', async () => {
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
    });

    let translated: string | undefined;
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('ping').setDescription('ping'),
      execute: (ctx) => {
        translated = ctx.t('greeting.hello');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeChatInputInteraction('ping') as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(translated).toBe('greeting.hello');
    await app.stop();
  });

  test('regression: onError passed to createCirce is called for a failing command, alongside onCommandError', async () => {
    const reported: unknown[] = [];
    let onCommandErrorCalled = false;
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      onError: (error, context) => {
        reported.push({ error, context });
      },
      onCommandError: () => {
        onCommandErrorCalled = true;
      },
    });
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('broken').setDescription('broken'),
      execute: () => {
        throw new Error('boom');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeChatInputInteraction('broken') as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(reported).toHaveLength(1);
    expect(
      (reported[0] as { context: { kind: string; name: string; correlationId: string } }).context,
    ).toEqual({
      kind: 'command',
      name: 'broken',
      correlationId: expect.any(String),
    });
    expect(onCommandErrorCalled).toBe(true);
    await app.stop();
  });

  test('regression: onError passed to createCirce is called for a failing event handler', async () => {
    const reported: unknown[] = [];
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      onError: (error, context) => {
        reported.push({ error, context });
      },
    });
    app.events.registry.register({
      name: 'guildCreate',
      execute: () => {
        throw new Error('event boom');
      },
    });

    await app.start();
    app.client.emit(Events.GuildCreate, {} as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(reported).toHaveLength(1);
    expect((reported[0] as { context: { kind: string; name: string } }).context.kind).toBe('event');
    expect((reported[0] as { context: { kind: string; name: string } }).context.name).toBe(
      'guildCreate',
    );
    await app.stop();
  });

  test('a throwing onError reporter never breaks the normal command error reply', async () => {
    let replied = false;
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      onError: () => {
        throw new Error('reporter exploded');
      },
      onCommandError: () => {
        replied = true;
      },
    });
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('broken').setDescription('broken'),
      execute: () => {
        throw new Error('boom');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeChatInputInteraction('broken') as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(replied).toBe(true);
    await app.stop();
  });

  test('app.components exposes a working registry independent of app.commands', async () => {
    const app = testApp();
    app.components.registry.register({ prefix: 'crate:', execute: async () => {} });

    expect(app.components.registry.size).toBe(1);
    expect(app.commands.registry.size).toBe(0);
  });

  test('installs and removes process signal handlers when enabled', async () => {
    const app = testApp({ handleProcessSignals: true });

    const before = process.listenerCount('SIGINT');
    await app.start();
    expect(process.listenerCount('SIGINT')).toBe(before + 1);

    await app.stop();
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  test('a SIGINT signal triggers graceful shutdown', async () => {
    const app = testApp({ handleProcessSignals: true });

    await app.start();
    expect(app.state).toBe('running');

    process.emit('SIGINT');
    await new Promise((resolve) => setImmediate(resolve));

    expect(app.state).toBe('stopped');
  });

  test('onReady hooks receive the client once the gateway is ready, in registration order', async () => {
    const app = testApp();
    const seen: string[] = [];
    app.onReady((client) => {
      seen.push(`a:${client === app.client}`);
    });
    app.onReady(async () => {
      seen.push('b');
    });

    await app.start();
    app.client.emit(Events.ClientReady, app.client as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toEqual(['a:true', 'b']);
    await app.stop();
  });

  test('a throwing onReady hook is logged and does not stop later hooks', async () => {
    const { logger, entries } = silentLogger();
    const app = createCirce({
      config: baseConfig,
      intents: [],
      logger,
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
    });
    let ranSecond = false;
    app.onReady(() => {
      throw new Error('ready boom');
    });
    app.onReady(() => {
      ranSecond = true;
    });

    await app.start();
    app.client.emit(Events.ClientReady, app.client as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(ranSecond).toBe(true);
    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
    await app.stop();
  });

  test('the i18n resolver receives guild and user context from a live command interaction', async () => {
    let received: unknown;
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
      i18n: {
        resolve: (key, _locale, _params, context) => {
          received = context;
          return key;
        },
      },
    });
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('ping').setDescription('ping'),
      execute: (ctx) => {
        ctx.t('k');
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, {
      ...fakeChatInputInteraction('ping'),
      guildId: 'guild-1',
      guildLocale: 'pt-BR',
    } as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(received).toEqual({ guildId: 'guild-1', guildLocale: 'pt-BR', userId: 'user-1' });
    await app.stop();
  });

  test('client options are merged under intents', () => {
    const app = createCirce({
      config: baseConfig,
      intents: [],
      client: { allowedMentions: { parse: [] }, partials: [Partials.Message] },
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
    });

    expect(app.client.options.partials).toEqual([Partials.Message]);
    expect(app.client.options.allowedMentions).toEqual({ parse: [] });
  });

  test('every() runs on ready, never overlaps, logs failures and stops with the app', async () => {
    const { logger, entries } = silentLogger();
    const app = createCirce({
      config: baseConfig,
      intents: [],
      logger,
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
    });
    let runs = 0;
    let release: (() => void) | undefined;
    app.every(
      2,
      async () => {
        runs += 1;
        // The first run stays in flight until released, so every tick meanwhile must be skipped.
        if (runs === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          throw new Error('tick failed');
        }
      },
      { name: 'sweep', runImmediately: true },
    );

    await app.start();
    expect(runs).toBe(0);

    app.client.emit(Events.ClientReady, app.client as never);
    await waitFor(() => runs === 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runs).toBe(1);

    release?.();
    await waitFor(() => runs >= 2);
    await app.stop();
    const runsAtStop = runs;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(runs).toBe(runsAtStop);
    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  test('every() and onReady() registered after ready run immediately', async () => {
    const app = testApp();
    await app.start();
    app.client.emit(Events.ClientReady, app.client as never);
    await new Promise((resolve) => setImmediate(resolve));

    let hookClient: unknown;
    let ticks = 0;
    app.onReady((client) => {
      hookClient = client;
    });
    app.every(
      1000,
      () => {
        ticks += 1;
      },
      { runImmediately: true },
    );
    await waitFor(() => ticks === 1 && hookClient === app.client);

    await app.stop();
  });

  test('a slow onReady hook does not delay interval timers', async () => {
    const app = testApp();
    let ticks = 0;
    app.onReady(() => new Promise((resolve) => setTimeout(resolve, 300)));
    app.every(
      1000,
      () => {
        ticks += 1;
      },
      { runImmediately: true },
    );

    await app.start();
    app.client.emit(Events.ClientReady, app.client as never);
    await waitFor(() => ticks === 1, 100);

    await app.stop();
  });

  test('every() rejects an interval that would spin the event loop', () => {
    const app = testApp();
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => app.every(bad, () => {})).toThrow(RangeError);
    }
  });

  test('a failed start stops the health server instead of leaking it', async () => {
    const port = await freePort();
    const app = createCirce({
      config: baseConfig,
      intents: [],
      health: { port, host: '127.0.0.1' },
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
    });
    app.onStart(() => {
      throw new Error('migration failed');
    });

    await expect(app.start()).rejects.toThrow();

    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });

  test('health server answers before onStart hooks run and stops with the app', async () => {
    const port = await freePort();
    const app = createCirce({
      config: baseConfig,
      intents: [],
      health: { port, host: '127.0.0.1', checks: { db: () => true } },
      handleProcessSignals: false,
      autoLogin: false,
      rest: stubRest(),
    });
    let duringStart: number | undefined;
    app.onStart(async () => {
      duringStart = (await fetch(`http://127.0.0.1:${port}/ready`)).status;
    });

    await app.start();
    const ready = await fetch(`http://127.0.0.1:${port}/ready`);
    await app.stop();

    expect(duringStart).toBe(503);
    expect(ready.status).toBe(200);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });

  test('a registration failure after startup destroys the client and runs stop hooks', async () => {
    const app = createCirce({
      config: baseConfig,
      intents: [],
      handleProcessSignals: false,
      autoLogin: false,
      rest: {
        put: async () => {
          throw new Error('discord rejected registration');
        },
      },
    });
    app.commands.registry.register({
      builder: new SlashCommandBuilder().setName('ping').setDescription('ping'),
      execute: () => {},
    });
    let stopped = false;
    app.onStop(() => {
      stopped = true;
    });

    await expect(app.start()).rejects.toThrow();

    expect(stopped).toBe(true);
    expect(app.state).toBe('stopped');
  });

  test('a rejected second start() leaves the running app untouched', async () => {
    const app = testApp();
    let stopHooks = 0;
    app.onStop(() => {
      stopHooks += 1;
    });

    await app.start();
    await expect(app.start()).rejects.toThrow();

    expect(app.state).toBe('running');
    expect(stopHooks).toBe(0);
    await app.stop();
    expect(stopHooks).toBe(1);
  });

  test('client.rest options reach the REST client used for command registration', async () => {
    const seen: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`);
        return Response.json([]);
      },
    });
    try {
      const app = createCirce({
        config: baseConfig,
        intents: [],
        client: { rest: { api: `http://127.0.0.1:${server.port}/api` } },
        handleProcessSignals: false,
        autoLogin: false,
      });
      app.commands.registry.register({
        builder: new SlashCommandBuilder().setName('ping').setDescription('ping'),
        execute: () => {},
      });

      await app.start();
      await app.stop();

      expect(seen).toEqual(['PUT /api/v10/applications/test-client-id/commands']);
    } finally {
      server.stop(true);
    }
  });
});

describe('process handlers and shutdown', () => {
  function signalApp(options: {
    onUnhandledRejection?: 'exit' | 'log';
    shutdownTimeoutMs?: number;
  }) {
    const { logger } = silentLogger();
    return createCirce({
      config: baseConfig,
      intents: [],
      logger,
      handleProcessSignals: true,
      autoLogin: false,
      rest: stubRest(),
      ...options,
    });
  }

  async function withCleanProcess(fn: () => Promise<void>): Promise<void> {
    const previousExitCode = process.exitCode;
    try {
      await fn();
    } finally {
      process.exitCode = previousExitCode ?? 0;
    }
  }

  /** A stop hook that stays pending until `release()` — a shutdown that hangs. */
  function hangingStopHook(app: ReturnType<typeof signalApp>) {
    let started = false;
    let resolveHook: () => void = () => {};
    app.onStop(
      () =>
        new Promise<void>((resolve) => {
          started = true;
          resolveHook = resolve;
        }),
    );
    return async () => {
      await waitFor(() => started);
      resolveHook();
    };
  }

  test('an unhandled rejection stops the app with exit code 1 by default', async () => {
    await withCleanProcess(async () => {
      const app = signalApp({});
      await app.start();

      process.emit('unhandledRejection', new Error('boom'), Promise.resolve());
      await waitFor(() => app.state === 'stopped');

      expect(process.exitCode).toBe(1);
    });
  });

  test("onUnhandledRejection 'log' keeps the app running", async () => {
    await withCleanProcess(async () => {
      const { logger, entries } = silentLogger();
      const app = createCirce({
        config: baseConfig,
        intents: [],
        logger,
        handleProcessSignals: true,
        autoLogin: false,
        rest: stubRest(),
        onUnhandledRejection: 'log',
      });
      await app.start();

      process.emit('unhandledRejection', new Error('boom'), Promise.resolve());

      expect(entries.some((entry) => entry.message.includes('boom'))).toBe(true);
      expect(app.state).toBe('running');
      expect(process.exitCode).not.toBe(1);
      await app.stop();
    });
  });

  test('a shutdown that outlives shutdownTimeoutMs forces exit code 1', async () => {
    await withCleanProcess(async () => {
      const exit = spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      const app = signalApp({ shutdownTimeoutMs: 20 });
      const release = hangingStopHook(app);
      await app.start();

      process.emit('SIGTERM');
      await waitFor(() => exit.mock.calls.length > 0);

      expect(exit).toHaveBeenCalledWith(1);
      exit.mockRestore();
      await release();
      await waitFor(() => app.state === 'stopped');
    });
  });

  test('a second signal during shutdown forces exit immediately', async () => {
    await withCleanProcess(async () => {
      const exit = spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      const app = signalApp({ shutdownTimeoutMs: 60_000 });
      const release = hangingStopHook(app);
      await app.start();

      process.emit('SIGTERM');
      process.emit('SIGTERM');

      expect(exit).toHaveBeenCalledWith(1);
      exit.mockRestore();
      await release();
      await waitFor(() => app.state === 'stopped');
    });
  });

  test('a clean shutdown does not force an exit', async () => {
    await withCleanProcess(async () => {
      const exit = spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      const app = signalApp({ shutdownTimeoutMs: 20 });
      await app.start();

      process.emit('SIGTERM');
      await waitFor(() => app.state === 'stopped');
      await Bun.sleep(40);

      expect(exit).not.toHaveBeenCalled();
      exit.mockRestore();
    });
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects shutdownTimeoutMs %p at creation',
    (shutdownTimeoutMs) => {
      expect(() => signalApp({ shutdownTimeoutMs })).toThrow('shutdownTimeoutMs');
    },
  );

  test('overlapping stop() calls share one shutdown', async () => {
    const app = testApp();
    let stops = 0;
    app.onStop(() => {
      stops += 1;
    });
    await app.start();

    await Promise.all([app.stop(), app.stop()]);

    expect(stops).toBe(1);
  });

  test('onStop hooks and the health server still stop when client.destroy() throws', async () => {
    const app = testApp();
    let stopped = false;
    app.onStop(() => {
      stopped = true;
    });
    await app.start();
    app.client.destroy = async () => {
      throw new Error('gateway teardown failed');
    };

    await expect(app.stop()).rejects.toThrow('gateway teardown failed');

    expect(stopped).toBe(true);
    expect(app.state).toBe('stopped');
  });
});
