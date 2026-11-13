/**
 * Storage contract for cooldown and rate limiting state.
 *
 * @remarks
 * Circe ships two built-in implementations:
 * - {@link MemoryCooldownStore}: In-memory Map with unref'd sweeping timer, suitable for single-process bots.
 * - `SqliteCooldownStore`: Persistent SQLite-backed store via `@sxnnyside/circe/sqlite`.
 *
 * Distributed setups (multi-instance bots, microservices) can implement this interface with Redis
 * or another distributed store without modifying Circe's guard logic.
 *
 * @public
 */
export interface CooldownStore {
  /**
   * Checks the remaining cooldown time for a key.
   *
   * @param key - The unique cooldown key (e.g. `cmd:user:123`).
   * @returns Milliseconds remaining before the key is free again, or `0` if it is free right now.
   */
  check(key: string): number | Promise<number>;

  /**
   * Records a cooldown hit, resetting the key's cooldown window.
   *
   * @param key - The unique cooldown key.
   * @param durationMs - Cooldown duration in milliseconds.
   */
  hit(key: string, durationMs: number): void | Promise<void>;

  /**
   * Starts a cooldown only if the key is free, as one atomic step.
   *
   * @remarks
   * Optional. Without it the {@link cooldown} guard calls `check` then `hit`, which lets two
   * simultaneous calls through when the store is shared between processes. A shared store
   * (Redis `SET key value PX ms NX`, a SQL conditional upsert) should implement it.
   *
   * @param key - The unique cooldown key.
   * @param durationMs - Cooldown duration in milliseconds.
   * @returns `0` when this call took the cooldown, otherwise the milliseconds left on the running one.
   */
  claim?(key: string, durationMs: number): number | Promise<number>;
}
