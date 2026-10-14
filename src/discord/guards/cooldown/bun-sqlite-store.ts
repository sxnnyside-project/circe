import { Database } from 'bun:sqlite';
import type { CooldownStore } from './types.js';

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

interface CooldownRow {
  expires_at: number;
}

/**
 * Bun-only `CooldownStore` backed by `bun:sqlite` — no npm dependency,
 * ultra-fast local persistence. Defaults to an in-memory database (same
 * durability profile as `MemoryCooldownStore`, faster for high-cardinality
 * keys); pass a file path to persist cooldowns across restarts. Importing
 * this module outside Bun fails immediately, the same way any other
 * Bun-only API would — it's an explicit opt-in a bot makes knowing it
 * targets Bun, never a silent fallback.
 */
export class BunSqliteCooldownStore implements CooldownStore {
  #db: Database;
  #sweepTimer: ReturnType<typeof setInterval>;

  constructor(path = ':memory:', sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS) {
    this.#db = new Database(path);
    this.#db.run(
      'CREATE TABLE IF NOT EXISTS cooldowns (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)',
    );
    this.#db.run('CREATE INDEX IF NOT EXISTS cooldowns_expires_at ON cooldowns (expires_at)');
    // A key that is never checked again would otherwise stay in the file forever.
    this.#sweepTimer = setInterval(() => this.#sweep(), sweepIntervalMs);
    this.#sweepTimer.unref?.();
  }

  #sweep(): void {
    this.#db.run('DELETE FROM cooldowns WHERE expires_at <= ?', [Date.now()]);
  }

  check(key: string): number {
    const row = this.#db
      .query('SELECT expires_at FROM cooldowns WHERE key = ?')
      .get(key) as CooldownRow | null;
    if (!row) {
      return 0;
    }

    const remaining = row.expires_at - Date.now();
    if (remaining <= 0) {
      this.#db.run('DELETE FROM cooldowns WHERE key = ?', [key]);
      return 0;
    }

    return remaining;
  }

  hit(key: string, durationMs: number): void {
    this.#db.run(
      'INSERT INTO cooldowns (key, expires_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at',
      [key, Date.now() + durationMs],
    );
  }

  /** Closes the underlying database connection. */
  dispose(): void {
    clearInterval(this.#sweepTimer);
    this.#db.close();
  }
}
