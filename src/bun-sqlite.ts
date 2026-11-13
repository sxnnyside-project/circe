/**
 * Bun-only subpath (`@sxnnyside/circe/bun-sqlite`).
 *
 * @deprecated Use `@sxnnyside/circe/sqlite` instead, which supports both `bun:sqlite` and `node:sqlite`.
 * @see {@link SqliteCooldownStore}
 * @packageDocumentation
 */
export {
  BunSqliteCooldownStore,
  SqliteCooldownStore,
  type SqliteCooldownStoreOptions,
  type SqliteDriverType,
} from './sqlite/cooldown-store.js';
