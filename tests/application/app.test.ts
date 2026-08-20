import { describe, expect, test } from "bun:test";
import { Events, SlashCommandBuilder } from "discord.js";
import { createCirce } from "../../src/application/app.js";
import type { CommandRest } from "../../src/discord/commands/registration.js";
import { createLogger, type LogEntry } from "../../src/logging/logger.js";

function fakeChatInputInteraction(commandName: string) {
  return {
    commandName,
    deferred: false,
    replied: false,
    guild: { id: "guild-1" },
    member: null,
    user: { id: "user-1", username: "tester" },
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
    guild: { id: "guild-1" },
    member: null,
    user: { id: "user-1", username: "tester" },
    isChatInputCommand: () => false,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isAutocomplete: () => false,
    isModalSubmit: () => false,
    reply: async () => {},
    followUp: async () => {},
  };
}

function silentLogger() {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

function stubRest(): CommandRest {
  return { put: async () => [] };
}

const baseConfig = { token: "test-token", clientId: "test-client-id" };

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

describe("createCirce", () => {
  test("starts in the created state and exposes config", () => {
    const app = testApp();
    expect(app.state).toBe("created");
    expect(app.config).toEqual(baseConfig);
  });

  test("exposes a real discord.js client, command registry, and event registry", () => {
    const app = testApp();
    expect(app.client).toBeDefined();
    expect(app.commands.registry.size).toBe(0);
    expect(app.events.registry.size).toBe(0);
  });

  test("start() transitions the app to running", async () => {
    const app = testApp();
    await app.start();
    expect(app.state).toBe("running");
    await app.stop();
  });

  test("stop() transitions the app to stopped and is idempotent", async () => {
    const app = testApp();
    await app.start();
    await app.stop();
    expect(app.state).toBe("stopped");

    await expect(app.stop()).resolves.toBeUndefined();
    expect(app.state).toBe("stopped");
  });

  test("regression: stop() awaits client.destroy() rather than resolving before it settles", async () => {
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

  test("onStart/onStop hooks run around the app lifecycle", async () => {
    const app = testApp();
    const calls: string[] = [];

    app.onStart(() => {
      calls.push("start");
    });
    app.onStop(() => {
      calls.push("stop");
    });

    await app.start();
    expect(calls).toEqual(["start"]);
    await app.stop();
    expect(calls).toEqual(["start", "stop"]);
  });

  test("regression: onStart hooks run before login and before command registration", async () => {
    const order: string[] = [];
    const rest: CommandRest = {
      put: async () => {
        order.push("register");
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
      order.push("login");
      return token;
    }) as typeof app.client.login;

    app.onStart(() => {
      order.push("consumer-hook");
    });

    await app.start();
    expect(order).toEqual(["consumer-hook", "login", "register"]);
    await app.stop();
  });

  test("regression: onStop hooks run after the client is destroyed", async () => {
    const app = testApp();
    const order: string[] = [];

    const originalDestroy = app.client.destroy.bind(app.client);
    app.client.destroy = (async () => {
      order.push("destroy");
      return originalDestroy();
    }) as typeof app.client.destroy;

    app.onStop(() => {
      order.push("consumer-hook");
    });

    await app.start();
    await app.stop();
    expect(order).toEqual(["destroy", "consumer-hook"]);
  });

  test("a failing start hook propagates and leaves the app stopped", async () => {
    const app = testApp();
    app.onStart(() => {
      throw new Error("dependency unavailable");
    });

    await expect(app.start()).rejects.toThrow("dependency unavailable");
    expect(app.state).toBe("stopped");
  });

  test("logs start and stop transitions", async () => {
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
    expect(messages).toContain("Circe application started");
    expect(messages).toContain("Circe application stopped");
  });

  test("registers commands automatically on start using the injected REST client", async () => {
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

  test("regression: onCommandError passed to createCirce is wired through to the live router", async () => {
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
      builder: new SlashCommandBuilder().setName("broken").setDescription("broken"),
      execute: () => {
        throw new Error("boom");
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeChatInputInteraction("broken") as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(called).toBe(true);
    await app.stop();
  });

  test("regression: onComponentError passed to createCirce is wired through to the live router", async () => {
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
      prefix: "crate:save:",
      execute: () => {
        throw new Error("boom");
      },
    });

    await app.start();
    app.client.emit(Events.InteractionCreate, fakeButtonInteraction("crate:save:1") as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(called).toBe(true);
    await app.stop();
  });

  test("app.components exposes a working registry independent of app.commands", async () => {
    const app = testApp();
    app.components.registry.register({ prefix: "crate:", execute: async () => {} });

    expect(app.components.registry.size).toBe(1);
    expect(app.commands.registry.size).toBe(0);
  });

  test("installs and removes process signal handlers when enabled", async () => {
    const app = testApp({ handleProcessSignals: true });

    const before = process.listenerCount("SIGINT");
    await app.start();
    expect(process.listenerCount("SIGINT")).toBe(before + 1);

    await app.stop();
    expect(process.listenerCount("SIGINT")).toBe(before);
  });

  test("a SIGINT signal triggers graceful shutdown", async () => {
    const app = testApp({ handleProcessSignals: true });

    await app.start();
    expect(app.state).toBe("running");

    process.emit("SIGINT");
    await new Promise((resolve) => setImmediate(resolve));

    expect(app.state).toBe("stopped");
  });
});
