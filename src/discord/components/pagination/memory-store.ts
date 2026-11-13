import type { PaginationSession, PaginationStore } from './types.js';

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

interface Entry {
  readonly session: PaginationSession;
  readonly expiresAt: number;
}

/**
 * Default in-memory backing store for paginator sessions.
 *
 * @remarks
 * Uses a periodic background sweep timer to purge expired pagination sessions
 * so memory is freed even if users abandon carousel messages without paging to the end.
 *
 * @public
 */
export class MemoryPaginationStore implements PaginationStore {
  readonly #sessions = new Map<string, Entry>();
  readonly #sweepTimer: ReturnType<typeof setInterval>;

  /**
   * Creates a new in-memory pagination store.
   *
   * @param sweepIntervalMs - Periodic cleanup sweep frequency in milliseconds.
   */
  constructor(sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS) {
    this.#sweepTimer = setInterval(() => this.#sweep(), sweepIntervalMs);
    this.#sweepTimer.unref?.();
  }

  /**
   * Retrieves an active session by its ID, returning `undefined` if expired.
   *
   * @param sessionId - Session UUID.
   * @returns The active session state, or `undefined`.
   */
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

  /**
   * Stores an active session with an expiration deadline.
   *
   * @param sessionId - Session UUID.
   * @param session - Current pagination state.
   * @param ttlMs - Time-to-live in milliseconds.
   */
  set(sessionId: string, session: PaginationSession, ttlMs: number): void {
    this.#sessions.set(sessionId, { session, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Deletes a session explicitly.
   *
   * @param sessionId - Session UUID.
   */
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

  /**
   * Stops the background sweep timer.
   */
  dispose(): void {
    clearInterval(this.#sweepTimer);
  }

  /**
   * Supports ECMAScript Explicit Resource Management (`using store = new MemoryPaginationStore()`).
   */
  [Symbol.dispose](): void {
    this.dispose();
  }
}
