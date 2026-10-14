import type { PaginationSession, PaginationStore } from './types.js';

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

interface Entry {
  readonly session: PaginationSession;
  readonly expiresAt: number;
}

/**
 * Default `PaginationStore` — an in-memory map, compatible with every
 * runtime Circe targets. Same shape as `MemoryCooldownStore`: a periodic,
 * `unref`'d sweep clears expired sessions so a long-running process never
 * accumulates state for pagers nobody is looking at anymore.
 */
export class MemoryPaginationStore implements PaginationStore {
  #sessions = new Map<string, Entry>();
  #sweepTimer: ReturnType<typeof setInterval>;

  constructor(sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS) {
    this.#sweepTimer = setInterval(() => this.#sweep(), sweepIntervalMs);
    this.#sweepTimer.unref?.();
  }

  get(sessionId: string): PaginationSession | undefined {
    const entry = this.#sessions.get(sessionId);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.#sessions.delete(sessionId);
      return undefined;
    }
    return entry.session;
  }

  set(sessionId: string, session: PaginationSession, ttlMs: number): void {
    this.#sessions.set(sessionId, { session, expiresAt: Date.now() + ttlMs });
  }

  delete(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }

  #sweep(): void {
    const now = Date.now();
    for (const [sessionId, entry] of this.#sessions) {
      if (entry.expiresAt <= now) {
        this.#sessions.delete(sessionId);
      }
    }
  }

  /** Stops the periodic sweep. Call when discarding a store instance — mainly relevant for tests. */
  dispose(): void {
    clearInterval(this.#sweepTimer);
  }
}
