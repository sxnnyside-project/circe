import type { IntervalOptions, IntervalTask } from '../application/app.js';
import { assertIntervalMs, type LifecycleHook, type ReadyHook } from '../application/lifecycle.js';
import { CirceError } from '../errors/circe-error.js';
import type { HealthCheck } from '../health/handler.js';

/**
 * Raised when an integration's `setup()` throws — always attributed to that integration's `name`.
 *
 * @see {@link CirceError}
 * @public
 */
export class IntegrationError extends CirceError {}

/**
 * Supported categories that integrations can contribute scan roots to.
 *
 * @public
 */
export type ScanCategory =
  | 'commands'
  | 'command-groups'
  | 'context-menus'
  | 'events'
  | 'components'
  | 'modals';

/**
 * Execution context passed to an integration's `setup()` function.
 * Enables contributing additional scan roots, lifecycle hooks, health checks, and recurring tasks.
 *
 * @public
 */
export interface CirceIntegrationContext {
  /**
   * Contributes an additional directory to scan for `category`, alongside `scanRoot`.
   *
   * @param category - Category to register scan root for.
   * @param path - Absolute or relative path to the directory.
   */
  addScanRoot(category: ScanCategory, path: string): void;

  /**
   * Registers a named readiness health check (e.g. database connectivity probe) for `/ready`.
   *
   * @param name - Unique health probe identifier.
   * @param check - Callback returning healthy status or throwing an error.
   */
  addHealthCheck(name: string, check: HealthCheck): void;

  /**
   * Runs before login and command registration.
   *
   * @param hook - Async or sync lifecycle hook callback.
   */
  onStart(hook: LifecycleHook): void;

  /**
   * Runs after the client has been destroyed.
   *
   * @param hook - Async or sync lifecycle hook callback.
   */
  onStop(hook: LifecycleHook): void;

  /**
   * Runs once the gateway is ready, with the logged-in `Client` — the place
   * to start anything that needs a live client, since `setup()` and
   * `onStart` run before one exists. Not fired under HTTP-only transport.
   *
   * @param hook - Ready hook callback accepting Discord Client.
   */
  onReady(hook: ReadyHook): void;

  /**
   * Runs `task` on an interval once the gateway is ready; stopped automatically on shutdown.
   *
   * @param intervalMs - Interval period in milliseconds. Must be a positive safe integer.
   * @param task - Periodic task callback receiving Discord Client.
   * @param options - Additional interval options (e.g. `runImmediately`).
   */
  every(intervalMs: number, task: IntervalTask, options?: IntervalOptions): void;
}

/**
 * Extension module contract declared in `circe.config.ts`.
 *
 * @example
 * ```ts
 * export const myIntegration = defineIntegration({
 *   name: 'my-plugin',
 *   setup(ctx) {
 *     ctx.addHealthCheck('db', async () => checkDb());
 *   },
 * });
 * ```
 *
 * @public
 */
export interface CirceIntegration {
  readonly name: string;
  setup(context: CirceIntegrationContext): void | Promise<void>;
}

/**
 * Identity helper for declaring an integration module.
 *
 * @param definition - Integration configuration containing name and setup function.
 * @returns The typed integration definition.
 * @public
 */
export function defineIntegration(definition: CirceIntegration): CirceIntegration {
  return definition;
}

/**
 * Normalized collection of all resources contributed by active integrations.
 *
 * @public
 */
export interface ResolvedIntegrations {
  readonly scanRoots: Readonly<Record<ScanCategory, readonly string[]>>;
  readonly healthChecks: Readonly<Record<string, HealthCheck>>;
  readonly onStartHooks: readonly LifecycleHook[];
  readonly onStopHooks: readonly LifecycleHook[];
  readonly onReadyHooks: readonly ReadyHook[];
  readonly intervals: readonly IntervalRegistration[];
}

/**
 * Registered recurring background task.
 *
 * @public
 */
export interface IntervalRegistration {
  readonly intervalMs: number;
  readonly task: IntervalTask;
  readonly options: IntervalOptions | undefined;
}

/**
 * Runs every integration's `setup()` once, collecting scan roots, health checks,
 * lifecycle hooks, and intervals. An integration that throws is attributed by name.
 *
 * @param integrations - Array of integrations to execute.
 * @returns Consolidated map of scan roots, hooks, health checks, and intervals.
 * @throws {@link IntegrationError} When an integration's `setup()` throws an error.
 * @public
 */
export async function resolveIntegrations(
  integrations: readonly CirceIntegration[] = [],
): Promise<ResolvedIntegrations> {
  const scanRoots: Record<ScanCategory, string[]> = {
    commands: [],
    'command-groups': [],
    'context-menus': [],
    events: [],
    components: [],
    modals: [],
  };
  const healthChecks: Record<string, HealthCheck> = {};
  const onStartHooks: LifecycleHook[] = [];
  const onStopHooks: LifecycleHook[] = [];
  const onReadyHooks: ReadyHook[] = [];
  const intervals: IntervalRegistration[] = [];

  for (const integration of integrations) {
    const context: CirceIntegrationContext = {
      addScanRoot: (category, path) => {
        scanRoots[category].push(path);
      },
      addHealthCheck: (name, check) => {
        healthChecks[name] = check;
      },
      onStart: (hook) => {
        onStartHooks.push(hook);
      },
      onStop: (hook) => {
        onStopHooks.push(hook);
      },
      onReady: (hook) => {
        onReadyHooks.push(hook);
      },
      every: (intervalMs, task, options) => {
        assertIntervalMs(intervalMs);
        intervals.push({ intervalMs, task, options });
      },
    };

    try {
      await integration.setup(context);
    } catch (error) {
      throw new IntegrationError(`Integration "${integration.name}" failed during setup`, {
        cause: error,
        metadata: { integration: integration.name },
      });
    }
  }

  return { scanRoots, healthChecks, onStartHooks, onStopHooks, onReadyHooks, intervals };
}
