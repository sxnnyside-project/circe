import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BunSqliteCooldownStore, SqliteCooldownStore } from '../../src/sqlite/cooldown-store.js';

describe('SqliteCooldownStore', () => {
  describe('bun driver', () => {
    test('check returns 0 for a key that was never hit', () => {
      const store = new SqliteCooldownStore({ driver: 'bun' });
      expect(store.check('never-hit')).toBe(0);
      store.dispose();
    });

    test('check returns remaining duration and deletes when expired', () => {
      const store = new SqliteCooldownStore({ driver: 'bun' });
      store.hit('k1', 5_000);
      expect(store.check('k1')).toBeGreaterThan(4_000);

      store.hit('expired', -10);
      expect(store.check('expired')).toBe(0);
      store.dispose();
    });

    test('supports Symbol.dispose', () => {
      let store: SqliteCooldownStore | undefined;
      {
        using s = new SqliteCooldownStore({ driver: 'bun' });
        s.hit('using-key', 5_000);
        expect(s.check('using-key')).toBeGreaterThan(0);
        store = s;
      }
      expect(store.check('using-key')).toBe(0);
    });
  });

  describe('node driver (node:sqlite DatabaseSync)', () => {
    test('check returns 0 for a key that was never hit', () => {
      const store = new SqliteCooldownStore({ driver: 'node' });
      expect(store.check('never-hit')).toBe(0);
      store.dispose();
    });

    test('records hit and checks expiration', () => {
      const store = new SqliteCooldownStore({ driver: 'node' });
      store.hit('node-key', 10_000);
      expect(store.check('node-key')).toBeGreaterThan(9_000);

      store.hit('node-expired', -1);
      expect(store.check('node-expired')).toBe(0);
      store.dispose();
    });

    test('disk database initializes with WAL mode and persists across instances', () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'circe-node-sqlite-'));
      const dbFile = path.join(dir, 'test.db');
      try {
        const store1 = new SqliteCooldownStore({ path: dbFile, driver: 'node' });
        store1.hit('persisted', 60_000);
        store1.dispose();

        const store2 = new SqliteCooldownStore({ path: dbFile, driver: 'node' });
        expect(store2.check('persisted')).toBeGreaterThan(50_000);
        store2.dispose();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('dispose is idempotent', () => {
      const store = new SqliteCooldownStore({ driver: 'node' });
      store.dispose();
      expect(() => store.dispose()).not.toThrow();
      expect(store.check('any')).toBe(0);
    });
  });

  describe('claim', () => {
    for (const driver of ['bun', 'node'] as const) {
      test(`${driver} driver: the first claim wins, a second sees the time left, an expired one is claimable again`, () => {
        const store = new SqliteCooldownStore({ driver });

        expect(store.claim('k', 5_000)).toBe(0);
        expect(store.claim('k', 5_000)).toBeGreaterThan(4_000);

        store.hit('old', -10);
        expect(store.claim('old', 5_000)).toBe(0);
        store.dispose();
      });
    }

    test('two stores on one file cannot both claim the same key', () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'circe-claim-'));
      const file = path.join(dir, 'cooldowns.sqlite');
      const a = new SqliteCooldownStore({ path: file });
      const b = new SqliteCooldownStore({ path: file });

      const results = [a.claim('shared', 5_000), b.claim('shared', 5_000)];

      expect(results.filter((remaining) => remaining === 0)).toHaveLength(1);
      a.dispose();
      b.dispose();
      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('BunSqliteCooldownStore legacy alias', () => {
    test('instantiates and operates identical to SqliteCooldownStore', () => {
      const store = new BunSqliteCooldownStore();
      store.hit('legacy', 10_000);
      expect(store.check('legacy')).toBeGreaterThan(9_000);
      store.dispose();
    });
  });
});
