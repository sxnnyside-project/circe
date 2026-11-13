/**
 * Universal SQLite persistence subpath (`@sxnnyside/circe/sqlite`).
 *
 * @remarks
 * Supports native `bun:sqlite` under Bun and standard library `node:sqlite` (`DatabaseSync`)
 * under Node 22.18+, Node 24+, and Deno 2.2+.
 *
 * @packageDocumentation
 */
export {
  BunSqliteCooldownStore,
  SqliteCooldownStore,
  type SqliteCooldownStoreOptions,
  type SqliteDriverType,
} from './sqlite/cooldown-store.js';
