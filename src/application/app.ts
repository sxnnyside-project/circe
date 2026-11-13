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
import type { I18nResolver, LocalizationResolver } from '../localization/resolver.js';
import { createLogger, type Logger } from '../logging/logger.js';
import type { InteractionTelemetryHandler } from '../observability/metrics.js';
import type { ErrorReporter } from '../observability/report-error.js';
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
 * its domain configuration schema. Circe requires exactly these fields.
 *
 * @public
 */
export interface CirceCredentials {
  /** The Discord Bot Token used for Gateway login and REST API authorization. */
  readonly token: string;
  /** The application Client ID from the Discord Developer Portal. */
  readonly clientId: string;
  /**
   * Present in development/staging for instant guild-scoped registration;
   * omitted in production for global command deployment.
   */
  readonly guildId?: string;
}

/**
 * Command registry and discovery interface.
 *
 * @public
 */
export interface CirceCommands {
  /** The underlying registered command definitions. */
  readonly registry: CommandRegistry;
  /**
   * Discovers, imports, and registers every command module found in `directory` (subfolders included).
   *
   * @param directory - Absolute path or file URL to scan.
   */
  load(directory: string | URL): Promise<void>;
  /**
   * Registers the current registry contents with Discord REST API
   * (guild-scoped if `guildId` is configured, global otherwise).
   */
  register(): Promise<void>;
}

/**
 * Hierarchical command group registry and loader.
 *
 * @public
 */
export interface CirceCommandGroups {
  /** Same underlying registry as {@link CirceCommands}. */
  readonly registry: CommandRegistry;
  /**
   * Discovers, imports, and registers every group folder found directly under `directory`.
   *
   * @param directory - Absolute path or file URL to scan.
   */
  load(directory: string | URL): Promise<void>;
}

/**
 * Context menu command registry and loader interface.
 *
 * @public
 */
export interface CirceContextMenuCommands {
  /** The underlying context menu command registry. */
  readonly registry: ContextMenuCommandRegistry;
  /**
   * Discovers, imports, and registers commands under `directory`'s fixed `users/` and `messages/` subfolders.
   *
   * @param directory - Absolute path or file URL to scan.
   */
  load(directory: string | URL): Promise<void>;
}

/**
 * Gateway event dispatcher and loader interface.
 *
 * @public
 */
export interface CirceEvents {
  /** The underlying event registry. */
  readonly registry: EventRegistry;
  /**
   * Discovers, imports, and registers every event module found in `directory`.
   *
   * @param directory - Absolute path or file URL to scan.
   */
  load(directory: string | URL): Promise<void>;
}

/**
 * Component interaction handler registry and loader interface.
 *
 * @public
 */
export interface CirceComponents {
  /** The underlying component handler registry. */
  readonly registry: ComponentRegistry;
  /**
   * Discovers, imports, and registers every component handler module found in `directory`.
   *
   * @param directory - Absolute path or file URL to scan.
   */
  load(directory: string | URL): Promise<void>;
}

/**
 * Modal submission handler registry and loader interface.
 *
 * @public
 */
export interface CirceModals {
  /** The underlying modal registry. */
  readonly registry: ModalRegistry;
  /**
   * Discovers, imports, and registers every modal handler module found in `directory`.
   *
   * @param directory - Absolute path or file URL to scan.
   */
  load(directory: string | URL): Promise<void>;
}

/**
 * The unified Circe application instance.
 *
 * @remarks
 * Orchestrates the full IoC runtime: lifecycle management, Discord client, command/event routers,
 * health endpoints, and graceful process signals.
 *
 * @public
 */
export interface CirceApp<Config extends CirceCredentials = CirceCredentials> {
  /** The resolved, validated application configuration. */
  readonly config: Config;
  /** Component-scoped root application logger. */
  readonly logger: Logger;
  /** Current state machine phase ('created' | 'starting' | 'running' | 'stopping' | 'stopped'). */
  readonly state: LifecycleState;
  /** The underlying discord.js Client instance. */
  readonly client: Client;
  /** Chat command management and bulk registration interface. */
  readonly commands: CirceCommands;
  /** Hierarchical command group loader and registration interface. */
  readonly commandGroups: CirceCommandGroups;
  /** Context menu command management interface. */
  readonly contextMenuCommands: CirceContextMenuCommands;
  /** Gateway event listeners management interface. */
  readonly events: CirceEvents;
  /** Component handlers management interface. */
  readonly components: CirceComponents;
  /** Modal handlers management interface. */
  readonly modals: CirceModals;
  /**
   * Registers a hook to run during `start()`, in registration order. All
   * `onStart` hooks run before login and before command registration — this
   * is where a bot puts database connections, service startup, or anything
   * else that needs to be ready before Discord traffic arrives.
   *
   * @param hook - Asynchronous or synchronous startup callback.
   */
  onStart(hook: LifecycleHook): void;
  /**
   * Registers a hook to run during `stop()`, in reverse registration order.
   * Runs after the client has been destroyed and signal handlers removed —
   * Discord stops sending new interactions before app-level resources tear down.
   *
   * @param hook - Asynchronous or synchronous teardown callback.
   */
  onStop(hook: LifecycleHook): void;
  /**
   * Registers a hook to run once the gateway connection is ready, with the
   * logged-in `Client` — for services that need a live client (reminder
   * delivery, metrics gauges) and so cannot start in `onStart`. Hooks run in
   * registration order; one that throws is logged and does not stop the
   * others. Never fires under the HTTP-only transport, which has no gateway
   * connection.
   *
   * @param hook - Ready callback receiving the authenticated Client.
   */
  onReady(hook: ReadyHook): void;
  /**
   * Runs `task` every `intervalMs` once the gateway is ready, and stops the
   * timer when the application stops. Runs never overlap (a tick is skipped
   * while the previous run is still in flight) and a throwing task is
   * logged, never fatal. Timing only: the schedule is not persisted, so a
   * restart begins a fresh interval. Never fires under the HTTP-only
   * transport.
   *
   * @param intervalMs - Schedule interval in milliseconds (must be > 0).
   * @param task - Periodic task callback receiving the authenticated Client.
   * @param options - Additional timer options.
   */
  every(intervalMs: number, task: IntervalTask, options?: IntervalOptions): void;
  /**
   * Starts the application: executes `onStart` hooks, logs in to Discord, and registers commands.
   *
   * @throws {@link LifecycleError} If called when the application is not in `'created'` state.
   */
  start(): Promise<void>;
  /**
   * Stops the application gracefully: destroys client, runs `onStop` hooks, and stops servers.
   */
  stop(): Promise<void>;
  /**
   * Supports Explicit Resource Management (`await using app = createCirce(...)`).
   * Automatically invokes {@link stop} upon exiting the `using` lexical scope.
   */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Task callback executed repeatedly on an interval timer.
 *
 * @param client - The authenticated discord.js Client instance.
 *
 * @public
 */
export type IntervalTask = (client: Client) => void | Promise<void>;

/**
 * Configuration options for {@link CirceApp.every}.
 *
 * @public
 */
export interface IntervalOptions {
  /**
   * Human-readable identifier for the task used in log messages.
   * @defaultValue `"interval"`
   */
  readonly name?: string;
  /**
   * Whether to run the task immediately upon readiness rather than waiting one interval.
   * @defaultValue `false`
   */
  readonly runImmediately?: boolean;
}

/**
 * Options accepted by {@link createCirce} to instantiate an application container.
 *
 * @public
 */
export interface CreateCirceOptions<Config extends CirceCredentials> {
  /** The validated Discord credentials and application configuration. */
  config: Config;
  /** Gateway intent bits required by this bot. */
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
   * process handlers on `start()` and removes them on `stop()`.
   * @defaultValue `true`
   */
  handleProcessSignals?: boolean;
  /**
   * What the process handler does with an unhandled promise rejection:
   * `'exit'` (default) logs it and shuts the app down with exit code 1;
   * `'log'` only logs it and keeps the bot running.
   * @defaultValue `'exit'`
   */
  onUnhandledRejection?: 'exit' | 'log';
  /**
   * How long a signal- or crash-triggered shutdown may take before the
   * process is forced to exit with code 1.
   * @defaultValue `10000` (10 seconds)
   */
  shutdownTimeoutMs?: number;
  /**
   * Whether `start()` registers commands with Discord automatically after login.
   * @defaultValue `true`
   */
  autoRegisterCommands?: boolean;
  /**
   * Whether `start()` calls `client.login()`, opening a real gateway connection.
   * @defaultValue `true`
   */
  autoLogin?: boolean;
  /** Override the REST client used for command registration — mainly for tests. */
  rest?: CommandRest;
  /** Called when an interaction names a command that isn't registered. */
  onUnknownCommand?: UnknownCommandHandler;
  /** Called when a guard denies execution. */
  onGuardDenied?: GuardDeniedHandler;
  /** Called when a command throws. Override for localized/branded error responses. */
  onCommandError?: CommandErrorHandler;
  /** Called when a customId doesn't match any registered component prefix. */
  onUnknownComponent?: UnknownComponentHandler;
  /** Called when a component handler throws. Override for localized/branded error responses. */
  onComponentError?: ComponentErrorHandler;
  /** Called when a component guard denies execution. */
  onComponentGuardDenied?: ComponentGuardDeniedHandler;
  /** Called when a modal guard denies execution. */
  onModalGuardDenied?: ModalGuardDeniedHandler;
  /** Called when a customId doesn't match any registered modal prefix. */
  onUnknownModal?: UnknownModalHandler;
  /** Called when a modal handler throws. Override for localized/branded error responses. */
  onModalError?: ModalErrorHandler;
  /** Called when a context menu interaction names a command that isn't registered. */
  onUnknownContextMenuCommand?: UnknownContextMenuCommandHandler;
  /** Called when a context menu command's guard denies execution. */
  onContextMenuGuardDenied?: ContextMenuGuardDeniedHandler;
  /** Called when a context menu command throws. Override for localized/branded error responses. */
  onContextMenuCommandError?: ContextMenuCommandErrorHandler;
  /** Runs `before`/`after` around every interaction — a bot's `middleware.ts`, or passed directly. */
  middleware?: MiddlewareModule;
  /** Resolves `ctx.t(key, params)` across interactions — a bot's `localization.ts`, or passed directly. */
  localization?: LocalizationResolver;
  /**
   * Resolves `ctx.t(key, params)` across interactions.
   * @deprecated Use `localization` instead.
   */
  i18n?: I18nResolver;
  /** Called for every error caught by routers or event dispatcher for external observability reporting. */
  onError?: ErrorReporter;
  /** Telemetry callback invoked upon every interaction lifecycle completion. */
  onInteractionComplete?: InteractionTelemetryHandler;
}

/**
 * Drops keys whose value is `undefined`: under `exactOptionalPropertyTypes`
 * an optional property may be absent but never explicitly `undefined`, and a
 * present-but-undefined handler would also shadow a router's own default.
 */
function omitUndefined<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

function installProcessHandlers<Config extends CirceCredentials>(
  app: CirceApp<Config>,
  settings: { onUnhandledRejection: 'exit' | 'log'; shutdownTimeoutMs: number },
): () => void {
  let shuttingDown = false;

  // A hung `onStop` hook or gateway teardown must not keep the process alive
  // until the orchestrator's SIGKILL, so a signal-driven shutdown is bounded.
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const timer = setTimeout(() => {
      app.logger.error('Shutdown timed out, forcing exit', {
        timeoutMs: settings.shutdownTimeoutMs,
      });
      process.exit(1);
    }, settings.shutdownTimeoutMs);
    app
      .stop()
      .catch((error: unknown) => {
        app.logger.error('Shutdown failed', { error: normalizeError(error) });
        process.exitCode = 1;
      })
      .finally(() => clearTimeout(timer));
  };

  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      app.logger.warn(`Received ${signal} during shutdown, forcing exit`, { signal });
      process.exit(1);
    }
    app.logger.info(`Received ${signal}, shutting down`, { signal });
    shutdown();
  };

  const onUncaughtException = (error: unknown): void => {
    const normalized = normalizeError(error, 'Uncaught exception');
    app.logger.error(normalized.message, {
      error: normalized,
      correlationId: normalized.correlationId,
    });
    process.exitCode = 1;
    shutdown();
  };

  const onUnhandledRejection = (reason: unknown): void => {
    const normalized = normalizeError(reason, 'Unhandled promise rejection');
    app.logger.error(normalized.message, {
      error: normalized,
      correlationId: normalized.correlationId,
    });
    if (settings.onUnhandledRejection === 'exit') {
      process.exitCode = 1;
      shutdown();
    }
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
 * Creates the Circe application container: the runtime foundation (lifecycle,
 * logging, config carrier, process handling) plus the Discord layer (real discord.js Client,
 * command, event, component, modal, and context-menu registry/router subsystems).
 *
 * @remarks
 * **Key Architectural Traits:**
 * - The `Client` is exposed directly as a public property; Circe does not wrap or obscure discord.js.
 * - Startup hooks (`onStart`) always run before login and before command registration.
 * - Teardown hooks (`onStop`) always run after the client is destroyed and incoming traffic ceases.
 * - Implements `Symbol.asyncDispose` for ECMAScript Explicit Resource Management.
 *
 * @param options - Application setup and configuration options.
 * @returns A fully initialized {@link CirceApp} instance ready to start.
 *
 * @example
 * ```typescript
 * import { createCirce } from '@sxnnyside/circe';
 *
 * await using app = createCirce({
 *   config: { token: process.env.DISCORD_TOKEN!, clientId: process.env.DISCORD_CLIENT_ID! },
 *   intents: [],
 * });
 *
 * await app.start();
 * ```
 *
 * @public
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
  if (
    options.shutdownTimeoutMs !== undefined &&
    !(Number.isFinite(options.shutdownTimeoutMs) && options.shutdownTimeoutMs > 0)
  ) {
    throw new RangeError(
      `shutdownTimeoutMs must be a positive, finite number of milliseconds, got ${options.shutdownTimeoutMs}`,
    );
  }
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
        ...omitUndefined({ guildId: options.config.guildId }),
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

  let stopInFlight: Promise<void> | undefined;

  const runStop = async (): Promise<void> => {
    if (lifecycle.state === 'created' || lifecycle.state === 'stopped') {
      await lifecycle.stop();
      return;
    }

    for (const timer of intervalTimers.splice(0)) {
      clearInterval(timer);
    }
    let destroyError: unknown;
    try {
      await client.destroy();
    } catch (error) {
      // A failed gateway teardown must not strand the consumer's onStop
      // resources (DB pools, ...) or the health server; it is rethrown last.
      destroyError = error;
    }

    try {
      // Consumer-registered onStop hooks (closing a DB pool, ...) run after
      // the client stops receiving new interactions, not before.
      await lifecycle.stop();
    } finally {
      // Last, so readiness keeps reporting not-ready while everything else
      // tears down.
      healthServer?.stop();
      healthServer = undefined;
      // Still installed while shutting down, so a repeated signal is
      // answered by the forced exit instead of the runtime's default.
      uninstallProcessHandlers?.();
      uninstallProcessHandlers = undefined;
    }

    if (destroyError !== undefined) {
      throw destroyError;
    }

    logger.info('Circe application stopped');
  };

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
        const localizationResolver = options.localization ?? options.i18n;
        const shared = {
          middleware: options.middleware,
          i18n: localizationResolver,
          onError: options.onError,
          onInteractionComplete: options.onInteractionComplete,
        };
        attachCommandRouter(client, {
          registry: commandRegistry,
          logger: logger.child({ component: 'commands' }),
          ...omitUndefined({
            ...shared,
            onUnknownCommand: options.onUnknownCommand,
            onGuardDenied: options.onGuardDenied,
            onCommandError: options.onCommandError,
          }),
        });
        attachComponentRouter(client, {
          registry: componentRegistry,
          logger: logger.child({ component: 'components' }),
          ...omitUndefined({
            ...shared,
            onUnknownComponent: options.onUnknownComponent,
            onComponentError: options.onComponentError,
            onGuardDenied: options.onComponentGuardDenied,
          }),
        });
        attachAutocompleteRouter(client, {
          registry: commandRegistry,
          logger: logger.child({ component: 'commands' }),
          ...omitUndefined({
            i18n: localizationResolver,
            onError: options.onError,
            onInteractionComplete: options.onInteractionComplete,
          }),
        });
        attachModalRouter(client, {
          registry: modalRegistry,
          logger: logger.child({ component: 'modals' }),
          ...omitUndefined({
            ...shared,
            onUnknownModal: options.onUnknownModal,
            onModalError: options.onModalError,
            onGuardDenied: options.onModalGuardDenied,
          }),
        });
        attachContextMenuRouter(client, {
          registry: contextMenuCommandRegistry,
          logger: logger.child({ component: 'commands' }),
          ...omitUndefined({
            ...shared,
            onUnknownContextMenuCommand: options.onUnknownContextMenuCommand,
            onGuardDenied: options.onContextMenuGuardDenied,
            onContextMenuCommandError: options.onContextMenuCommandError,
          }),
        });
      }

      // Health answers `starting` from before any onStart hook runs, so an
      // orchestrator probing during migrations or login sees a live process
      // rather than a refused connection.
      if (options.health && healthServer === undefined) {
        healthServer = startInteractionsServer({
          port: options.health.port,
          ...omitUndefined({ host: options.health.host }),
          fetch: createHealthHandler({
            client,
            expectGateway: autoLogin,
            isRunning: () => lifecycle.state === 'running',
            config: options.health,
            logger: logger.child({ component: 'health' }),
          }),
          logger,
          label: 'Health server',
          onListenError: () => void app.stop(),
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
        uninstallProcessHandlers = installProcessHandlers(app, {
          onUnhandledRejection: options.onUnhandledRejection ?? 'exit',
          shutdownTimeoutMs: options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
        });
      }

      logger.info('Circe application started');
    },
    stop() {
      // One shutdown at a time: a signal arriving during a manual `stop()`
      // joins it instead of destroying the client and running hooks twice.
      stopInFlight ??= runStop().finally(() => {
        stopInFlight = undefined;
      });
      return stopInFlight;
    },
    async [Symbol.asyncDispose]() {
      await this.stop();
    },
  };

  return app;
}
