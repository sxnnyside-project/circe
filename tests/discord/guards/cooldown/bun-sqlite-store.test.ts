import { describe, expect, test } from "bun:test";
import { BunSqliteCooldownStore } from "../../../../src/discord/guards/cooldown/bun-sqlite-store.js";

describe("BunSqliteCooldownStore", () => {
  test("check returns 0 for a key that was never hit", () => {
    const store = new BunSqliteCooldownStore();
    expect(store.check("never-hit")).toBe(0);
    store.dispose();
  });

  test("check returns a positive remaining duration right after a hit", () => {
    const store = new BunSqliteCooldownStore();
    store.hit("key", 10_000);
    const remaining = store.check("key");
    expect(remaining).toBeGreaterThan(9_000);
    expect(remaining).toBeLessThanOrEqual(10_000);
    store.dispose();
  });

  test("check returns 0 once the duration has elapsed, and deletes the row", () => {
    const store = new BunSqliteCooldownStore();
    store.hit("key", -1);
    expect(store.check("key")).toBe(0);
    expect(store.check("key")).toBe(0);
    store.dispose();
  });

  test("a second hit on the same key overwrites its expiry rather than erroring", () => {
    const store = new BunSqliteCooldownStore();
    store.hit("key", 1_000);
    store.hit("key", 60_000);
    const remaining = store.check("key");
    expect(remaining).toBeGreaterThan(1_000);
    store.dispose();
  });

  test("keys are independent of each other", () => {
    const store = new BunSqliteCooldownStore();
    store.hit("a", 60_000);
    expect(store.check("b")).toBe(0);
    store.dispose();
  });
});
