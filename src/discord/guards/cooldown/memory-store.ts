import type { CooldownStore } from "./types.js";

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/**
 * Default `CooldownStore` — an in-memory map, compatible with every
 * runtime Circe targets. A key that expires without ever being checked
 * again (a user who hits a command once and never returns) would
 * otherwise sit in memory forever; a periodic sweep clears expired
 * entries so long-running processes don't leak. The sweep timer is
 * `unref`'d so it never keeps the process alive on its own.
 */
export class MemoryCooldownStore implements CooldownStore {
  #expiresAt = new Map<string, number>();
  #sweepTimer: ReturnType<typeof setInterval>;

  constructor(sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS) {
    this.#sweepTimer = setInterval(() => this.#sweep(), sweepIntervalMs);
    this.#sweepTimer.unref?.();
  }

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

  hit(key: string, durationMs: number): void {
    this.#expiresAt.set(key, Date.now() + durationMs);
  }

  #sweep(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.#expiresAt) {
      if (expiresAt <= now) {
        this.#expiresAt.delete(key);
      }
    }
  }

  /** Stops the periodic sweep. Call when discarding a store instance — mainly relevant for tests. */
  dispose(): void {
    clearInterval(this.#sweepTimer);
  }
}
