/**
 * Bun-only subpath (`@sxnnyside/circe/bun-sqlite`). Never imported by the
 * main entry point — `bun:sqlite` doesn't exist outside Bun, and importing
 * it eagerly from `src/index.ts` would break the package for every Node
 * and Deno consumer the moment they imported anything from it at all.
 */
export { BunSqliteCooldownStore } from './discord/guards/cooldown/bun-sqlite-store.js';
