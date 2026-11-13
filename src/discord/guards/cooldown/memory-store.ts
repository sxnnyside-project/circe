import type { CooldownStore } from './types.js';

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/**
 * In-memory implementation of {@link CooldownStore}.
 *
 * @remarks
 * Stores cooldown timestamps in a JavaScript `Map`. A background timer periodically sweeps expired entries
 * so long-running bots do not leak memory for one-time interactions. The timer is `unref`'d by default,
 * ensuring it does not hold the Node.js/Bun process open.
 *
 * Implements {@link Disposable} (`using` keyword) to cleanly clear timers during lifecycle shutdown or in tests.
 *
 * @example
 * ```typescript
 * using store = new MemoryCooldownStore();
 * store.hit('user:123', 5000);
 * const remaining = store.check('user:123'); // ~5000
 * ```
 *
 * @public
 */
export class MemoryCooldownStore implements CooldownStore, Disposable {
  readonly #expiresAt = new Map<string, number>();
  readonly #sweepTimer: ReturnType<typeof setInterval>;

  /**
   * Creates a new `MemoryCooldownStore`.
   *
   * @param sweepIntervalMs - Frequency in milliseconds to sweep expired entries. Defaults to 60,000 (1 minute).
   */
  constructor(sweepIntervalMs: number = DEFAULT_SWEEP_INTERVAL_MS) {
    this.#sweepTimer = setInterval(() => this.#sweep(), sweepIntervalMs);
    this.#sweepTimer.unref?.();
  }

  /**
   * Checks the remaining cooldown milliseconds for a key.
   *
   * @param key - The unique cooldown key.
   * @returns Remaining time in milliseconds, or `0` if expired or never used.
   */
  check(key: string): number {
    const expiresAt = this.#expiresAt.get(key);
    if (expiresAt === undefined) {
      return 0;
    }

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      this.#expiresAt.delete(key);
      return 0;
    }

    return remaining;
  }

  /**
   * Sets or extends a cooldown for a key.
   *
   * @param key - The unique cooldown key.
   * @param durationMs - Cooldown duration in milliseconds.
   */
  hit(key: string, durationMs: number): void {
    this.#expiresAt.set(key, Date.now() + durationMs);
  }

  /**
   * Starts a cooldown only if the key is free. Atomic because it never yields to the event loop.
   *
   * @param key - The unique cooldown key.
   * @param durationMs - Cooldown duration in milliseconds.
   * @returns `0` when this call took the cooldown, otherwise the milliseconds left on the running one.
   */
  claim(key: string, durationMs: number): number {
    const remaining = this.check(key);
    if (remaining === 0) {
      this.hit(key, durationMs);
    }
    return remaining;
  }

  #sweep(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.#expiresAt) {
      if (expiresAt <= now) {
        this.#expiresAt.delete(key);
      }
    }
  }

  /**
   * Stops the background sweep timer and cleans up resources.
   */
  dispose(): void {
    clearInterval(this.#sweepTimer);
  }

  /**
   * Supports ECMAScript Explicit Resource Management (`using store = new MemoryCooldownStore()`).
   */
  [Symbol.dispose](): void {
    this.dispose();
  }
}
