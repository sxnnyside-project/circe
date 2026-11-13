/**
 * SQLite cooldown persistence layer.
 *
 * @remarks
 * Universal SQLite-backed cooldown store supporting `bun:sqlite` and standard `node:sqlite`.
 *
 * @packageDocumentation
 */
export {
  BunSqliteCooldownStore,
  SqliteCooldownStore,
  type SqliteCooldownStoreOptions,
  type SqliteDriverType,
} from './cooldown-store.js';
