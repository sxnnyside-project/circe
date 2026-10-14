import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWatcher } from '../../src/runtime/watcher.js';

describe('createWatcher', () => {
  test('reports a file written under a watched directory, and stops reporting after stop()', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'circe-watch-'));
    let changes = 0;
    const watcher = createWatcher([{ path: dir }, { path: path.join(dir, 'missing') }]);
    watcher.start(() => {
      changes += 1;
    });

    try {
      await writeFile(path.join(dir, 'a.ts'), 'export {};');
      const deadline = Date.now() + 2_000;
      while (changes === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(changes).toBeGreaterThan(0);

      watcher.stop();
      const before = changes;
      await writeFile(path.join(dir, 'b.ts'), 'export {};');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(changes).toBe(before);
    } finally {
      watcher.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
