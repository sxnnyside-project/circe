import { Client, type ClientOptions, Events, type GatewayIntentBits, REST } from 'discord.js';
import { attachAutocompleteRouter } from '../discord/commands/autocomplete.js';
import { loadCommandGroups } from '../discord/commands/groups/loader.js';
import { loadCommands } from '../discord/commands/loader.js';
import { type CommandRest, registerCommands } from '../discord/commands/registration.js';
import { CommandRegistry } from '../discord/commands/registry.js';
import {
  attachCommandRouter,
  type CommandErrorHandler,
  type GuardDeniedHandler,
  type UnknownCommandHandler,
} from '../discord/commands/router.js';
import { loadComponents } from '../discord/components/loader.js';
import { ComponentRegistry } from '../discord/components/registry.js';
import {
  attachComponentRouter,
  type ComponentErrorHandler,
  type ComponentGuardDeniedHandler,
  type UnknownComponentHandler,
} from '../discord/components/router.js';
import { loadContextMenuCommands } from '../discord/context-menus/loader.js';
import { ContextMenuCommandRegistry } from '../discord/context-menus/registry.js';
import {
  attachContextMenuRouter,
  type ContextMenuCommandErrorHandler,
  type ContextMenuGuardDeniedHandler,
  type UnknownContextMenuCommandHandler,
} from '../discord/context-menus/router.js';
import { attachEvents } from '../discord/events/dispatcher.js';
import { loadEvents } from '../discord/events/loader.js';
import { EventRegistry } from '../discord/events/registry.js';
import { loadModals } from '../discord/modals/loader.js';
import { ModalRegistry } from '../discord/modals/registry.js';
import {
  attachModalRouter,
  type ModalErrorHandler,
  type ModalGuardDeniedHandler,
  type UnknownModalHandler,
} from '../discord/modals/router.js';
import { normalizeError } from '../errors/normalize-error.js';
import { createHealthHandler, type HealthConfig } from '../health/handler.js';
import type { I18nResolver } from '../i18n/types.js';
import { createLogger, type Logger } from '../logging/logger.js';
import type { ErrorReporter } from '../observability/types.js';
import { type InteractionsServer, startInteractionsServer } from '../transport/serve.js';
import {
  assertIntervalMs,
  Lifecycle,
  type LifecycleHook,
  type LifecycleState,
  type ReadyHook,
} from './lifecycle.js';
import type { MiddlewareModule } from './middleware.js';

/**
 * The minimal Discord credential contract every bot needs regardless of
 * what else its own configuration schema contains. Circe requires exactly
 * these fields on `config` — nothing bot-specific.
 */
export interface CirceCredentials {
  readonly token: string;
  readonly clientId: string;
  /** Present in development/staging for guild-scoped registration; absent in production for global registration. */
  readonly guildId?: string;
}

export interface CirceCommands {
  readonly registry: CommandRegistry;
  /** Discovers, imports, and registers every command module found in `directory` (subfolders included). */
  load(directory: string | URL): Promise<void>;
  /** Registers the current registry contents with Discord (guild-scoped if `guildId` is configured, global otherwise). */
  register(): Promise<void>;
}

export interface CirceCommandGroups {
  /** Same registry as `commands` — a group folder assembles into one ordinary registered command. */
  readonly registry: CommandRegistry;
  /** Discovers, imports, and registers every group folder found directly under `directory`. */
  load(directory: string | URL): Promise<void>;
}

export interface CirceContextMenuCommands {
  readonly registry: ContextMenuCommandRegistry;
  /** Discovers, imports, and registers every command under `directory`'s fixed `users/` and `messages/` subfolders. */
  load(directory: string | URL): Promise<void>;
}

export interface CirceEvents {
  readonly registry: EventRegistry;
  /** Discovers, imports, and registers every event module found in `directory` (subfolders included). */
  load(directory: string | URL): Promise<void>;
}

export interface CirceComponents {
  readonly registry: ComponentRegistry;
  /** Discovers, imports, and registers every component handler module found in `directory` (subfolders included). */
  load(directory: string | URL): Promise<void>;
}

export interface CirceModals {
  readonly registry: ModalRegistry;
  /** Discovers, imports, and registers every modal handler module found in `directory` (subfolders included). */
  load(directory: string | URL): Promise<void>;
}

export interface CirceApp<Config extends CirceCredentials = CirceCredentials> {
  readonly config: Config;
  readonly logger: Logger;
  readonly state: LifecycleState;
  readonly client: Client;
  readonly commands: CirceCommands;
  readonly commandGroups: CirceCommandGroups;
  readonly contextMenuCommands: CirceContextMenuCommands;
  readonly events: CirceEvents;
  readonly components: CirceComponents;
  readonly modals: CirceModals;
  /**
   * Registers a hook to run during `start()`, in registration order. All
   * `onStart` hooks run before login and before command registration — this
   * is where a bot puts database connections, service startup, or anything
   * else that needs to be ready before Discord traffic arrives.
   */
  onStart(hook: LifecycleHook): void;
  /**
   * Registers a hook to run during `stop()`, in reverse registration order.
   * Runs after the client has been destroyed and signal handlers removed —
   * Discord stops sending new interactions before app-level resources tear down.
   */
  onStop(hook: LifecycleHook): void;
  /**
   * Registers a hook to run once the gateway connection is ready, with the
   * logged-in `Client` — for services that need a live client (reminder
   * delivery, metrics gauges) and so cannot start in `onStart`. Hooks run in
   * registration order; one that throws is logged and does not stop the
   * others. Never fires under the HTTP-only transport, which has no gateway
   * connection.
   */
  onReady(hook: ReadyHook): void;
  /**
   * Runs `task` every `intervalMs` once the gateway is ready, and stops the
   * timer when the application stops. Runs never overlap (a tick is skipped
   * while the previous run is still in flight) and a throwing task is
   * logged, never fatal. Timing only: the schedule is not persisted, so a
   * restart begins a fresh interval. Never fires under the HTTP-only
   * transport.
   */
  every(intervalMs: number, task: IntervalTask, options?: IntervalOptions): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type IntervalTask = (client: Client) => void | Promise<void>;

export interface IntervalOptions {
  /** Identifies the task in logs. Defaults to `"interval"`. */
  readonly name?: string;
  /** Run once as soon as the client is ready instead of waiting a full interval. Defaults to `false`. */
  readonly runImmediately?: boolean;
}

export interface CreateCirceOptions<Config extends CirceCredentials> {
  config: Config;
  intents: GatewayIntentBits[];
  /**
   * Remaining discord.js `Client` options — `partials`, `presence`,
   * `allowedMentions`, cache `makeCache`/`sweepers`, `rest`, sharding
   * `shards`. `intents` stays a top-level option so it is never set twice.
   */
  client?: Omit<ClientOptions, 'intents'>;
  /** Serves `/health` and `/ready` on `health.port`, listening before login. */
  health?: HealthConfig;
  /** Supply a pre-configured logger; otherwise a default one is created. */
  logger?: Logger;
  /**
   * Whether Circe installs SIGINT/SIGTERM/uncaughtException/unhandledRejection
   * process handlers on `start()` and removes them on `stop()`. Defaults to
   * `true`. Set `false` in environments (e.g. tests) that manage the process
   * lifecycle themselves.
   */
  handleProcessSignals?: boolean;
  /** Whether `start()` registers commands with Discord automatically after login. Defaults to `true`. */
  autoRegisterCommands?: boolean;
  /**
   * Whether `start()` calls `client.login()`, opening a real gateway
   * connection. Defaults to `true`. Set `false` to exercise the rest of the
   * startup sequence (event/command wiring, registration) without a live
   * Discord connection — the situation any test of a Circe app is in.
   */
  autoLogin?: boolean;
  /** Override the REST client used for command registration — mainly for tests. Defaults to a real discord.js `REST` instance. */
  rest?: CommandRest;
  /** Called when an interaction names a command that isn't registered. Defaults to a plain ephemeral reply. */
  onUnknownCommand?: UnknownCommandHandler;
  /** Called when a guard denies execution. Defaults to a plain ephemeral reply with the guard's reason. */
  onGuardDenied?: GuardDeniedHandler;
  /** Called when a command throws. Defaults to a plain ephemeral reply. Override for localized/branded error responses. */
  onCommandError?: CommandErrorHandler;
  /** Called when a customId doesn't match any registered component prefix. Defaults to a plain ephemeral reply. */
  onUnknownComponent?: UnknownComponentHandler;
  /** Called when a component handler throws. Defaults to a plain ephemeral reply. Override for localized/branded error responses. */
  onComponentError?: ComponentErrorHandler;
  /** Called when a component guard denies execution. Defaults to a plain ephemeral reply with the guard's reason. */
  onComponentGuardDenied?: ComponentGuardDeniedHandler;
  /** Called when a modal guard denies execution. Defaults to a plain ephemeral reply with the guard's reason. */
  onModalGuardDenied?: ModalGuardDeniedHandler;
  /** Called when a customId doesn't match any registered modal prefix. Defaults to a plain ephemeral reply. */
  onUnknownModal?: UnknownModalHandler;
  /** Called when a modal handler throws. Defaults to a plain ephemeral reply. Override for localized/branded error responses. */
  onModalError?: ModalErrorHandler;
  /** Called when a context menu interaction names a command that isn't registered. Defaults to a plain ephemeral reply. */
  onUnknownContextMenuCommand?: UnknownContextMenuCommandHandler;
  /** Called when a context menu command's guard denies execution. Defaults to a plain ephemeral reply with the guard's reason. */
  onContextMenuGuardDenied?: ContextMenuGuardDeniedHandler;
  /** Called when a context menu command throws. Defaults to a plain ephemeral reply. Override for localized/branded error responses. */
  onContextMenuCommandError?: ContextMenuCommandErrorHandler;
  /** Runs `before`/`after` around every command, component, modal, and context menu interaction — a bot's `middleware.ts`, or passed directly. */
  middleware?: MiddlewareModule;
  /** Resolves `ctx.t(key, params)` across every command, component, modal, and context menu interaction — a bot's `i18n.ts`, or passed directly. Defaults to a resolver that returns keys verbatim, untranslated. */
  i18n?: I18nResolver;
  /** Called for every error any router's boundary — or the event dispatcher — catches, decoupled from user-facing replies. For external reporting: OpenTelemetry, Sentry, metrics. */
  onError?: ErrorReporter;
}

function installProcessHandlers<Config extends CirceCredentials>(
  app: CirceApp<Config>,
): () => void {
  const onSignal = (signal: NodeJS.Signals): void => {
    app.logger.info(`Received ${signal}, shutting down`, { signal });
    app.stop().catch((error: unknown) => {
      app.logger.error('Shutdown failed after signal', { error: normalizeError(error) });
      process.exitCode = 1;
    });
  };

  const onUncaughtException = (error: unknown): void => {
    const normalized = normalizeError(error, 'Uncaught exception');
    app.logger.error(normalized.message, {
      error: normalized,
      correlationId: normalized.correlationId,
    });
    process.exitCode = 1;
    void app.stop();
  };

  const onUnhandledRejection = (reason: unknown): void => {
    const normalized = normalizeError(reason, 'Unhandled promise rejection');
    app.logger.error(normalized.message, {
      error: normalized,
      correlationId: normalized.correlationId,
    });
    process.exitCode = 1;
    void app.stop();
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);

  return () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('uncaughtException', onUncaughtException);
    process.off('unhandledRejection', onUnhandledRejection);
  };
}

/**
 * Creates the Circe application: the runtime foundation (lifecycle,
 * logging, config carrier, process handling) plus the Discord layer — a
 * real `discord.js` `Client`, and a registry/loader/router triplet each
 * for commands, events, and components, plus autocomplete routing bound
 * to whichever commands define it. The client is a plain public property;
 * Circe does not wrap or hide it.
 *
 * `start()`/`stop()` orchestrate Circe's own side effects (listener
 * attachment, login, registration, signal handling, client teardown)
 * directly rather than folding them into the `Lifecycle`'s own hook list —
 * that keeps `onStart`/`onStop` hooks a bot registers purely additive:
 * `onStart` hooks always run before login/registration, `onStop` hooks
 * always run after the client is already destroyed, regardless of when
 * the bot happens to call `app.onStart()`/`app.onStop()`.
 */
export function createCirce<Config extends CirceCredentials>(
  options: CreateCirceOptions<Config>,
): CirceApp<Config> {
  const logger = options.logger ?? createLogger({ metadata: { component: 'circe' } });
  const lifecycle = new Lifecycle({
    onCleanupError: (error) => {
      logger.error(error.message, { error });
    },
  });
  const handleProcessSignals = options.handleProcessSignals ?? true;
  const autoRegisterCommands = options.autoRegisterCommands ?? true;
  const autoLogin = options.autoLogin ?? true;

  const client = new Client({ ...options.client, intents: options.intents });
  const readyHooks: ReadyHook[] = [];
  const intervalStarters: ((readyClient: Client) => void)[] = [];
  let readyClient: Client | undefined;
  const intervalTimers: ReturnType<typeof setInterval>[] = [];
  let healthServer: InteractionsServer | undefined;

  const runReadyHook = async (hook: ReadyHook, readyClient: Client): Promise<void> => {
    try {
      await hook(readyClient);
    } catch (error) {
      const normalized = normalizeError(error, 'onReady hook failed');
      logger.error(normalized.message, { error: normalized });
    }
  };
  const commandRegistry = new CommandRegistry();
  const eventRegistry = new EventRegistry();
  const componentRegistry = new ComponentRegistry();
  const modalRegistry = new ModalRegistry();
  const contextMenuCommandRegistry = new ContextMenuCommandRegistry();
  const rest =
    options.rest ??
    new REST({ version: '10', ...options.client?.rest }).setToken(options.config.token);

  const commands: CirceCommands = {
    registry: commandRegistry,
    load: (directory) =>
      loadCommands(directory, {
        registry: commandRegistry,
        logger: logger.child({ component: 'commands' }),
      }),
    register: () =>
      registerCommands({
        rest,
        clientId: options.config.clientId,
        ...(options.config.guildId !== undefined ? { guildId: options.config.guildId } : {}),
        commands: commandRegistry.all,
        userContextMenuCommands: contextMenuCommandRegistry.allUser,
        messageContextMenuCommands: contextMenuCommandRegistry.allMessage,
        logger: logger.child({ component: 'commands' }),
      }),
  };

  const contextMenuCommands: CirceContextMenuCommands = {
    registry: contextMenuCommandRegistry,
    load: (directory) =>
      loadContextMenuCommands(directory, {
        registry: contextMenuCommandRegistry,
        logger: logger.child({ component: 'commands' }),
      }),
  };

  const commandGroups: CirceCommandGroups = {
    registry: commandRegistry,
    load: (directory) =>
      loadCommandGroups(directory, {
        registry: commandRegistry,
        logger: logger.child({ component: 'commands' }),
      }),
  };

  const events: CirceEvents = {
    registry: eventRegistry,
    load: (directory) =>
      loadEvents(directory, {
        registry: eventRegistry,
        logger: logger.child({ component: 'events' }),
      }),
  };

  const components: CirceComponents = {
    registry: componentRegistry,
    load: (directory) =>
      loadComponents(directory, {
        registry: componentRegistry,
        logger: logger.child({ component: 'components' }),
      }),
  };

  const modals: CirceModals = {
    registry: modalRegistry,
    load: (directory) =>
      loadModals(directory, {
        registry: modalRegistry,
        logger: logger.child({ component: 'modals' }),
      }),
  };

  let uninstallProcessHandlers: (() => void) | undefined;

  const app: CirceApp<Config> = {
    config: options.config,
    logger,
    client,
    commands,
    commandGroups,
    contextMenuCommands,
    events,
    components,
    modals,
    get state() {
      return lifecycle.state;
    },
    onStart: (hook) => lifecycle.onStart(hook),
    onStop: (hook) => lifecycle.onStop(hook),
    onReady: (hook) => {
      if (readyClient) {
        void runReadyHook(hook, readyClient);
      } else {
        readyHooks.push(hook);
      }
    },
    every(intervalMs, task, intervalOptions = {}) {
      assertIntervalMs(intervalMs);
      const name = intervalOptions.name ?? 'interval';
      let running = false;
      const tick = async (readyClient: Client): Promise<void> => {
        if (running) {
          return;
        }
        running = true;
        try {
          await task(readyClient);
        } catch (error) {
          const normalized = normalizeError(error, `Interval task "${name}" failed`);
          logger.error(normalized.message, { error: normalized, task: name });
        } finally {
          running = false;
        }
      };
      const startTimer = (readyClient: Client): void => {
        if (lifecycle.state === 'stopping' || lifecycle.state === 'stopped') {
          return;
        }
        const timer = setInterval(() => void tick(readyClient), intervalMs);
        timer.unref?.();
        intervalTimers.push(timer);
        if (intervalOptions.runImmediately) {
          void tick(readyClient);
        }
      };
      // A registration made after the gateway is already ready starts at once;
      // otherwise it waits for ready, ahead of the (possibly slow) onReady hooks.
      if (readyClient) {
        startTimer(readyClient);
      } else {
        intervalStarters.push(startTimer);
      }
    },
    async start() {
      // Listener attachment must only ever happen once — guard it the same
      // way `lifecycle.start()` itself guards against a double start, since
      // this runs before that check (deliberately, so it precedes even the
      // consumer's own onStart hooks) and would otherwise double-attach on
      // a second, invalid call.
      if (lifecycle.state === 'created') {
        client.once(Events.ClientReady, async (ready) => {
          readyClient = ready;
          for (const startTimer of intervalStarters) {
            startTimer(ready);
          }
          for (const hook of readyHooks) {
            await runReadyHook(hook, ready);
          }
        });
        attachEvents(client, eventRegistry, logger.child({ component: 'events' }), options.onError);
        attachCommandRouter(client, {
          registry: commandRegistry,
          logger: logger.child({ component: 'commands' }),
          ...(options.onUnknownCommand !== undefined
            ? { onUnknownCommand: options.onUnknownCommand }
            : {}),
          ...(options.onGuardDenied !== undefined ? { onGuardDenied: options.onGuardDenied } : {}),
          ...(options.onCommandError !== undefined
            ? { onCommandError: options.onCommandError }
            : {}),
          ...(options.middleware !== undefined ? { middleware: options.middleware } : {}),
          ...(options.i18n !== undefined ? { i18n: options.i18n } : {}),
          ...(options.onError !== undefined ? { onError: options.onError } : {}),
        });
        attachComponentRouter(client, {
          registry: componentRegistry,
          logger: logger.child({ component: 'components' }),
          ...(options.onUnknownComponent !== undefined
            ? { onUnknownComponent: options.onUnknownComponent }
            : {}),
          ...(options.onComponentError !== undefined
            ? { onComponentError: options.onComponentError }
            : {}),
          ...(options.onComponentGuardDenied !== undefined
            ? { onGuardDenied: options.onComponentGuardDenied }
            : {}),
          ...(options.middleware !== undefined ? { middleware: options.middleware } : {}),
          ...(options.i18n !== undefined ? { i18n: options.i18n } : {}),
          ...(options.onError !== undefined ? { onError: options.onError } : {}),
        });
        attachAutocompleteRouter(client, {
          registry: commandRegistry,
          logger: logger.child({ component: 'commands' }),
          ...(options.i18n !== undefined ? { i18n: options.i18n } : {}),
        });
        attachModalRouter(client, {
          registry: modalRegistry,
          logger: logger.child({ component: 'modals' }),
          ...(options.onUnknownModal !== undefined
            ? { onUnknownModal: options.onUnknownModal }
            : {}),
          ...(options.onModalError !== undefined ? { onModalError: options.onModalError } : {}),
          ...(options.onModalGuardDenied !== undefined
            ? { onGuardDenied: options.onModalGuardDenied }
            : {}),
          ...(options.middleware !== undefined ? { middleware: options.middleware } : {}),
          ...(options.i18n !== undefined ? { i18n: options.i18n } : {}),
          ...(options.onError !== undefined ? { onError: options.onError } : {}),
        });
        attachContextMenuRouter(client, {
          registry: contextMenuCommandRegistry,
          logger: logger.child({ component: 'commands' }),
          ...(options.onUnknownContextMenuCommand !== undefined
            ? { onUnknownContextMenuCommand: options.onUnknownContextMenuCommand }
            : {}),
          ...(options.onContextMenuGuardDenied !== undefined
            ? { onGuardDenied: options.onContextMenuGuardDenied }
            : {}),
          ...(options.onContextMenuCommandError !== undefined
            ? { onContextMenuCommandError: options.onContextMenuCommandError }
            : {}),
          ...(options.middleware !== undefined ? { middleware: options.middleware } : {}),
          ...(options.i18n !== undefined ? { i18n: options.i18n } : {}),
          ...(options.onError !== undefined ? { onError: options.onError } : {}),
        });
      }

      // Health answers `starting` from before any onStart hook runs, so an
      // orchestrator probing during migrations or login sees a live process
      // rather than a refused connection.
      if (options.health && healthServer === undefined) {
        healthServer = startInteractionsServer({
          port: options.health.port,
          ...(options.health.host !== undefined ? { host: options.health.host } : {}),
          fetch: createHealthHandler({
            client,
            expectGateway: autoLogin,
            isRunning: () => lifecycle.state === 'running',
            config: options.health,
            logger: logger.child({ component: 'health' }),
          }),
          logger,
          label: 'Health server',
        });
      }

      // Cleanup below is only for the call that actually started the app: a
      // rejected second `start()` must never tear down the running one.
      let startedHere = false;
      try {
        // Consumer-registered onStart hooks (DB connections, service startup, ...)
        // run here — before login, before registration, before any Discord traffic.
        // Also where an invalid double-start throws, consistently with Lifecycle's own error.
        await lifecycle.start();
        startedHere = true;

        if (autoLogin) {
          await client.login(options.config.token);
        } else {
          // `login()` is what normally sets the client's REST auth token —
          // skipping it (HTTP-only transport, tests) must not also break
          // every REST call `interaction.reply()`/command registration make.
          client.rest.setToken(options.config.token);
        }

        if (autoRegisterCommands) {
          await commands.register();
        }
      } catch (error) {
        // A failed start must not leave a half-alive process behind: a
        // connected gateway, running stop-hook resources, or a health server
        // answering for something that will never become ready. A failure
        // inside `lifecycle.start()` has already run its own cleanup.
        for (const timer of intervalTimers.splice(0)) {
          clearInterval(timer);
        }
        if (startedHere) {
          await client.destroy();
          try {
            await lifecycle.stop();
          } catch (stopError) {
            logger.error('Shutdown after failed start also failed', {
              error: normalizeError(stopError),
            });
          }
        }
        if (startedHere || lifecycle.state === 'stopped') {
          healthServer?.stop();
          healthServer = undefined;
        }
        throw error;
      }

      if (handleProcessSignals) {
        uninstallProcessHandlers = installProcessHandlers(app);
      }

      logger.info('Circe application started');
    },
    async stop() {
      if (lifecycle.state === 'created' || lifecycle.state === 'stopped') {
        await lifecycle.stop();
        return;
      }

      uninstallProcessHandlers?.();
      uninstallProcessHandlers = undefined;
      for (const timer of intervalTimers.splice(0)) {
        clearInterval(timer);
      }
      await client.destroy();

      // Consumer-registered onStop hooks (closing a DB pool, ...) run after
      // the client stops receiving new interactions, not before.
      await lifecycle.stop();

      // Last, so readiness keeps reporting not-ready while everything else
      // tears down.
      healthServer?.stop();
      healthServer = undefined;

      logger.info('Circe application stopped');
    },
  };

  return app;
}
