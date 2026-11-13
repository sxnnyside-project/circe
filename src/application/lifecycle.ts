import type { Client } from 'discord.js';
import { CirceError } from '../errors/circe-error.js';
import { normalizeError } from '../errors/normalize-error.js';

/**
 * The discrete operational states of the application runtime.
 *
 * @public
 */
export type LifecycleState = 'created' | 'starting' | 'running' | 'stopping' | 'stopped';

/**
 * Callback function executed during startup or shutdown phases.
 *
 * @public
 */
export type LifecycleHook = () => void | Promise<void>;

/**
 * Hook executed once the Discord Gateway connection is established, receiving the authenticated client.
 *
 * @param client - The active and authenticated discord.js Client instance.
 *
 * @public
 */
export type ReadyHook = (client: Client) => void | Promise<void>;

/**
 * Asserts that an interval duration is safe to schedule without spinning the event loop.
 *
 * @param intervalMs - The duration in milliseconds.
 * @throws {@link RangeError} When interval is not a positive finite number.
 *
 * @internal
 */
export function assertIntervalMs(intervalMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError(
      `Interval must be a positive, finite number of milliseconds, got ${intervalMs}`,
    );
  }
}

/**
 * Raised for invalid lifecycle state transitions or hook failures during phase changes.
 *
 * @public
 */
export class LifecycleError extends CirceError {}

/**
 * Deterministic finite state machine governing application initialization and teardown.
 *
 * @remarks
 * **Phase Transitions:**
 * `created` → `starting` → `running` → `stopping` → `stopped`.
 *
 * Startup hooks run in FIFO order (registration order). Stop hooks run in LIFO order
 * (reverse registration order). If any startup hook throws, all stop hooks for previously
 * started components are executed to avoid leaking system resources before rethrowing.
 *
 * @public
 */
export class Lifecycle {
  #onCleanupError: ((error: CirceError) => void) | undefined;
  #state: LifecycleState = 'created';
  readonly #startHooks: LifecycleHook[] = [];
  readonly #stopHooks: LifecycleHook[] = [];

  /**
   * Creates a new Lifecycle state machine.
   *
   * @param options - Configuration options.
   * @param options.onCleanupError - Callback invoked if a rollback cleanup hook throws during startup failure.
   */
  constructor(options: { onCleanupError?: (error: CirceError) => void } = {}) {
    this.#onCleanupError = options.onCleanupError;
  }

  /**
   * The current operational phase of the application.
   */
  get state(): LifecycleState {
    return this.#state;
  }

  /**
   * Registers a callback to run during {@link start}, in FIFO order.
   *
   * @param hook - The initialization callback.
   */
  onStart(hook: LifecycleHook): void {
    this.#startHooks.push(hook);
  }

  /**
   * Registers a callback to run during {@link stop}, in LIFO order.
   *
   * @param hook - The teardown callback.
   */
  onStop(hook: LifecycleHook): void {
    this.#stopHooks.push(hook);
  }

  /**
   * Transitions the application from `created` to `running`.
   *
   * @remarks
   * Executes all registered `onStart` hooks sequentially. If any hook fails,
   * runs all registered `onStop` hooks in reverse order to clean up partial resources,
   * transitions to `stopped`, and propagates the normalized error.
   *
   * @throws {@link LifecycleError} When called from any state other than `created`, or when
   * {@link stop} was called while the start hooks were still running.
   */
  async start(): Promise<void> {
    if (this.#state !== 'created') {
      throw new LifecycleError(`Cannot start from state "${this.#state}"`, { operational: true });
    }

    this.#state = 'starting';

    try {
      for (const hook of this.#startHooks) {
        await hook();
      }
    } catch (error) {
      for (const hook of [...this.#stopHooks].reverse()) {
        try {
          await hook();
        } catch (cleanupError) {
          this.#onCleanupError?.(normalizeError(cleanupError, 'Shutdown hook failed'));
        }
      }
      this.#state = 'stopped';
      throw normalizeError(error, 'Circe startup failed');
    }

    // A `stop()` that arrived mid-startup already ran the teardown hooks; going on to
    // `running` would log in a bot whose resources are closed.
    if (this.#state !== 'starting') {
      throw new LifecycleError('Stopped during startup', { operational: true });
    }

    this.#state = 'running';
  }

  /**
   * Transitions the application to `stopped`.
   *
   * @remarks
   * Idempotent: safe to call repeatedly once stopped. Executes all registered
   * `onStop` hooks in LIFO order. If any hook throws, remaining hooks continue executing,
   * and all failures are aggregated into a single {@link LifecycleError}.
   *
   * @throws {@link LifecycleError} When one or more stop hooks throw during cleanup.
   */
  async stop(): Promise<void> {
    if (this.#state === 'stopped' || this.#state === 'created') {
      this.#state = 'stopped';
      return;
    }

    this.#state = 'stopping';

    const failures: CirceError[] = [];
    for (const hook of [...this.#stopHooks].reverse()) {
      try {
        await hook();
      } catch (error) {
        failures.push(normalizeError(error, 'Shutdown hook failed'));
      }
    }

    this.#state = 'stopped';

    if (failures.length > 0) {
      throw new LifecycleError(`${failures.length} shutdown hook(s) failed`, {
        operational: false,
        metadata: { failures },
      });
    }
  }

  /**
   * Supports Explicit Resource Management (`await using lifecycle = new Lifecycle()`).
   * Calls {@link stop} when exiting the `using` lexical scope.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }
}
