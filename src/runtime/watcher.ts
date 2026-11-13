import { existsSync, type FSWatcher, watch as fsWatch } from 'node:fs';
import { detectRuntime } from './detect.js';

/**
 * Filesystem target path to observe for modifications.
 *
 * @public
 */
export interface WatchTarget {
  /** Target file or directory path string. */
  readonly path: string;

  /**
   * Watch subdirectories recursively.
   *
   * @defaultValue `true`
   */
  readonly recursive?: boolean;
}

/**
 * Generic filesystem watcher handle.
 *
 * @public
 */
export interface Watcher {
  /**
   * Starts observing target paths and registers the change callback.
   *
   * @param onChange - Callback triggered whenever watched paths change.
   */
  start(onChange: () => void): void;

  /**
   * Stops watching and frees all underlying OS file watcher descriptors.
   */
  stop(): void;
}

interface DenoFsWatcher extends AsyncIterable<unknown> {
  close(): void;
}

interface DenoNamespace {
  watchFs(paths: string | string[]): DenoFsWatcher;
}

function createFsWatcher(targets: readonly WatchTarget[]): Watcher {
  let handles: FSWatcher[] = [];

  return {
    start(onChange) {
      handles = [];
      for (const target of targets) {
        if (!existsSync(target.path)) {
          continue;
        }
        try {
          const watcher = fsWatch(target.path, { recursive: target.recursive ?? true }, () =>
            onChange(),
          );
          handles.push(watcher);
        } catch {
          // Path may have disappeared or lacks permission — ignore
        }
      }
    },
    stop() {
      for (const handle of handles) {
        try {
          handle.close();
        } catch {
          // Already closed
        }
      }
      handles = [];
    },
  };
}

function createDenoWatcher(targets: readonly WatchTarget[]): Watcher {
  let watcher: DenoFsWatcher | undefined;

  return {
    start(onChange) {
      const deno = (globalThis as { Deno?: DenoNamespace }).Deno;
      if (!deno) {
        return;
      }

      const paths = targets
        .filter((target) => existsSync(target.path))
        .map((target) => target.path);

      if (paths.length === 0) {
        return;
      }

      try {
        watcher = deno.watchFs(paths);
      } catch {
        return;
      }

      const activeWatcher = watcher;
      void (async () => {
        try {
          for await (const _event of activeWatcher) {
            onChange();
          }
        } catch {
          // Watcher was closed or stream cancelled
        }
      })();
    },
    stop() {
      try {
        watcher?.close();
      } catch {
        // Already closed
      }
      watcher = undefined;
    },
  };
}

/**
 * Creates a platform-adapted filesystem watcher for the current runtime:
 * Bun and Node 22+ use native `node:fs.watch({ recursive: true })`,
 * while Deno uses native `Deno.watchFs`.
 *
 * @remarks
 * Correctly frees descriptors across all platforms: under Deno, calling `watcher.stop()`
 * guarantees that `watcher.close()` terminates the background file-descriptor stream.
 *
 * @example
 * ```ts
 * const watcher = createWatcher([{ path: './src', recursive: true }]);
 * watcher.start(() => console.log('File changed!'));
 * // Later
 * watcher.stop();
 * ```
 *
 * @param targets - Array of file or directory targets to observe.
 * @returns A runtime-adapted `Watcher` handle.
 * @public
 */
export function createWatcher(targets: readonly WatchTarget[]): Watcher {
  return detectRuntime() === 'deno' ? createDenoWatcher(targets) : createFsWatcher(targets);
}
