import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BunSqliteCooldownStore } from '../../../../src/discord/guards/cooldown/bun-sqlite-store.js';

describe('BunSqliteCooldownStore', () => {
  test('check returns 0 for a key that was never hit', () => {
    const store = new BunSqliteCooldownStore();
    expect(store.check('never-hit')).toBe(0);
    store.dispose();
  });

  test('check returns a positive remaining duration right after a hit', () => {
    const store = new BunSqliteCooldownStore();
    store.hit('key', 10_000);
    const remaining = store.check('key');
    expect(remaining).toBeGreaterThan(9_000);
    expect(remaining).toBeLessThanOrEqual(10_000);
    store.dispose();
  });

  test('check returns 0 once the duration has elapsed, and deletes the row', () => {
    const store = new BunSqliteCooldownStore();
    store.hit('key', -1);
    expect(store.check('key')).toBe(0);
    expect(store.check('key')).toBe(0);
    store.dispose();
  });

  test('a second hit on the same key overwrites its expiry rather than erroring', () => {
    const store = new BunSqliteCooldownStore();
    store.hit('key', 1_000);
    store.hit('key', 60_000);
    const remaining = store.check('key');
    expect(remaining).toBeGreaterThan(1_000);
    store.dispose();
  });

  test('keys are independent of each other', () => {
    const store = new BunSqliteCooldownStore();
    store.hit('a', 60_000);
    expect(store.check('b')).toBe(0);
    store.dispose();
  });

  test('a periodic sweep deletes expired rows that are never checked again', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'circe-cooldown-'));
    const file = path.join(dir, 'cooldowns.db');
    const store = new BunSqliteCooldownStore(file, 5);
    try {
      store.hit('expired', -1);
      store.hit('alive', 60_000);
      await new Promise((resolve) => setTimeout(resolve, 40));

      const reader = new Database(file, { readonly: true });
      const keys = (reader.query('SELECT key FROM cooldowns').all() as { key: string }[]).map(
        (row) => row.key,
      );
      reader.close();

      expect(keys).toEqual(['alive']);
    } finally {
      store.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
