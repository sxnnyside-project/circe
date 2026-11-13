import { createRequire } from 'node:module';
import type { CooldownStore } from '../discord/guards/cooldown/types.js';
import { detectRuntime } from '../runtime/detect.js';

const require = createRequire(import.meta.url);
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/** @internal */
interface InternalDriver {
  get(key: string): { expires_at: number } | null | undefined;
  hit(key: string, expiresAt: number): void;
  delete(key: string): void;
  sweep(now: number): void;
  close(): void;
}

/**
 * Driver engine to use for SQLite operations.
 *
 * @remarks
 * - `'auto'`: Detects the runtime and selects `'bun'` under Bun, `'node'` under Node/Deno.
 * - `'bun'`: Uses Bun's native `bun:sqlite` engine (zero-copy, Bun only).
 * - `'node'`: Uses standard library `node:sqlite` (DatabaseSync, Node 22.5+, Node 24+, Deno 2+, Bun).
 *
 * @public
 */
export type SqliteDriverType = 'auto' | 'bun' | 'node';

/**
 * Configuration options for `SqliteCooldownStore`.
 *
 * @public
 */
export interface SqliteCooldownStoreOptions {
  /**
   * Path to the SQLite database file on disk, or `":memory:"`.
   *
   * @defaultValue `":memory:"`
   */
  readonly path?: string;

  /**
   * Interval in milliseconds between sweeps of expired rows.
   *
   * @defaultValue `60000`
   */
  readonly sweepIntervalMs?: number;

  /**
   * Storage driver to use.
   *
   * @defaultValue `'auto'`
   */
  readonly driver?: SqliteDriverType;
}

/** @internal */
type BunDatabaseConstructor = new (
  path: string,
) => {
  run(sql: string, params?: unknown[]): void;
  query(sql: string): {
    get(param?: unknown): unknown;
    run(...params: unknown[]): void;
  };
  close(): void;
};

/** @internal */
type NodeDatabaseSyncConstructor = new (
  path: string,
) => {
  exec(sql: string): void;
  prepare(sql: string): {
    get(param?: unknown): unknown;
    run(...params: unknown[]): void;
  };
  close(): void;
};

/** @internal */
function createBunDriver(path: string): InternalDriver {
  let DatabaseClass: BunDatabaseConstructor;
  try {
    DatabaseClass = require('bun:sqlite').Database;
  } catch (error) {
    throw new Error(
      'The "bun" SQLite driver requires the Bun runtime (bun:sqlite). Consider driver: "auto" or "node".',
      { cause: error },
    );
  }

  const db = new DatabaseClass(path);
  if (path !== ':memory:') {
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA synchronous = NORMAL;');
  }
  db.run(
    'CREATE TABLE IF NOT EXISTS cooldowns (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);',
  );
  db.run('CREATE INDEX IF NOT EXISTS cooldowns_expires_at ON cooldowns (expires_at);');

  const checkStmt = db.query('SELECT expires_at FROM cooldowns WHERE key = ?;');
  const hitStmt = db.query(
    'INSERT INTO cooldowns (key, expires_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at;',
  );
  const deleteStmt = db.query('DELETE FROM cooldowns WHERE key = ?;');
  const sweepStmt = db.query('DELETE FROM cooldowns WHERE expires_at <= ?;');

  return {
    get: (key) => checkStmt.get(key) as { expires_at: number } | null,
    hit: (key, expiresAt) => hitStmt.run(key, expiresAt),
    delete: (key) => deleteStmt.run(key),
    sweep: (now) => sweepStmt.run(now),
    close: () => db.close(),
  };
}

/** @internal */
function createNodeDriver(path: string): InternalDriver {
  let DatabaseSyncClass: NodeDatabaseSyncConstructor;
  try {
    DatabaseSyncClass = require('node:sqlite').DatabaseSync;
  } catch (error) {
    throw new Error(
      'The "node" SQLite driver requires Node 22.5+, Node 24+, Deno 2+, or Bun with node:sqlite support.',
      { cause: error },
    );
  }

  const db = new DatabaseSyncClass(path);
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec(
    'CREATE TABLE IF NOT EXISTS cooldowns (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);',
  );
  db.exec('CREATE INDEX IF NOT EXISTS cooldowns_expires_at ON cooldowns (expires_at);');

  const checkStmt = db.prepare('SELECT expires_at FROM cooldowns WHERE key = ?;');
  const hitStmt = db.prepare(
    'INSERT INTO cooldowns (key, expires_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at;',
  );
  const deleteStmt = db.prepare('DELETE FROM cooldowns WHERE key = ?;');
  const sweepStmt = db.prepare('DELETE FROM cooldowns WHERE expires_at <= ?;');

  return {
    get: (key) => checkStmt.get(key) as { expires_at: number } | undefined,
    hit: (key, expiresAt) => hitStmt.run(key, expiresAt),
    delete: (key) => deleteStmt.run(key),
    sweep: (now) => sweepStmt.run(now),
    close: () => db.close(),
  };
}

/**
 * Universal SQLite-backed `CooldownStore` supporting both `bun:sqlite` (under Bun)
 * and `node:sqlite` (under Node 22.5+, Node 24+, Deno 2+).
 *
 * @remarks
 * Architecture features:
 * - Zero external npm dependencies.
 * - Prepared statements compiled once at initialization for maximum throughput.
 * - Automatic WAL mode (`PRAGMA journal_mode = WAL`) on disk databases.
 * - Implements `Symbol.dispose` for ECMAScript Explicit Resource Management (`using`).
 *
 * @example
 * ```ts
 * import { SqliteCooldownStore } from '@sxnnyside/circe/sqlite';
 *
 * // Standard usage
 * const store = new SqliteCooldownStore({ path: './cache/cooldowns.sqlite' });
 *
 * // Or with Explicit Resource Management (TS 5.2+ / Node 22+)
 * using localStore = new SqliteCooldownStore(':memory:');
 * ```
 *
 * @public
 */
export class SqliteCooldownStore implements CooldownStore {
  #driver: InternalDriver;
  #sweepTimer: ReturnType<typeof setInterval>;
  #disposed = false;

  /**
   * Creates a new `SqliteCooldownStore` instance.
   *
   * @param options - File path string (e.g. `":memory:"` or `"./data.sqlite"`) or full options object.
   * @param legacySweepIntervalMs - Sweep interval in ms when `options` is supplied as a raw path string.
   */
  constructor(
    options: string | SqliteCooldownStoreOptions = ':memory:',
    legacySweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
  ) {
    const opts: SqliteCooldownStoreOptions =
      typeof options === 'string'
        ? { path: options, sweepIntervalMs: legacySweepIntervalMs }
        : options;

    const path = opts.path ?? ':memory:';
    const sweepIntervalMs = opts.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    const requestedDriver = opts.driver ?? 'auto';

    const runtime = detectRuntime();
    const effectiveDriver =
      requestedDriver === 'auto' ? (runtime === 'bun' ? 'bun' : 'node') : requestedDriver;

    this.#driver = effectiveDriver === 'bun' ? createBunDriver(path) : createNodeDriver(path);

    this.#sweepTimer = setInterval(() => this.#sweep(), sweepIntervalMs);
    this.#sweepTimer.unref?.();
  }

  #sweep(): void {
    if (this.#disposed) {
      return;
    }
    this.#driver.sweep(Date.now());
  }

  /**
   * Checks whether a cooldown key is currently active.
   *
   * @param key - Cooldown bucket identifier.
   * @returns Milliseconds remaining before the cooldown expires, or `0` if expired or not set.
   * @public
   */
  check(key: string): number {
    if (this.#disposed) {
      return 0;
    }
    const row = this.#driver.get(key);
    if (!row) {
      return 0;
    }

    const remaining = row.expires_at - Date.now();
    if (remaining <= 0) {
      this.#driver.delete(key);
      return 0;
    }

    return remaining;
  }

  /**
   * Sets or updates a cooldown key to expire after the specified duration.
   *
   * @param key - Cooldown bucket identifier.
   * @param durationMs - Cooldown duration in milliseconds from now.
   * @public
   */
  hit(key: string, durationMs: number): void {
    if (this.#disposed) {
      return;
    }
    this.#driver.hit(key, Date.now() + durationMs);
  }

  /**
   * Closes the underlying database connection and clears the background sweep timer.
   *
   * @public
   */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    clearInterval(this.#sweepTimer);
    this.#driver.close();
  }

  /**
   * Explicit Resource Management hook (`using` keyword support).
   *
   * @public
   */
  [Symbol.dispose](): void {
    this.dispose();
  }
}

/**
 * Cooldown store backed by `bun:sqlite`.
 *
 * @deprecated Use `SqliteCooldownStore` from `@sxnnyside/circe/sqlite` instead.
 * @see {@link SqliteCooldownStore}
 * @public
 */
export class BunSqliteCooldownStore extends SqliteCooldownStore {
  /**
   * Creates a new `BunSqliteCooldownStore` instance using the `'bun'` driver.
   *
   * @param path - SQLite database file path. Defaults to `":memory:"`.
   * @param sweepIntervalMs - Interval in ms between expired row sweeps. Defaults to 60,000ms.
   */
  constructor(path = ':memory:', sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS) {
    super({ path, sweepIntervalMs, driver: 'bun' });
  }
}
