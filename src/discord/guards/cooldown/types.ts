/**
 * Backing store for cooldown state. Circe ships two implementations
 * (`MemoryCooldownStore`, `BunSqliteCooldownStore`); a bot with heavier
 * needs (shared state across processes) implements this interface itself
 * — Redis, a real database, anything — without Circe depending on it.
 */
export interface CooldownStore {
  /** Milliseconds remaining before `key` is free again, or `0` if it's free right now. */
  check(key: string): number | Promise<number>;
  /** Marks `key` as used now, starting a cooldown of `durationMs`. */
  hit(key: string, durationMs: number): void | Promise<void>;
}
