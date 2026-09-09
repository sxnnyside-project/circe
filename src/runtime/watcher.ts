import { existsSync, type FSWatcher, watch as fsWatch } from "node:fs";
import { detectRuntime } from "./detect.js";

export interface WatchTarget {
  readonly path: string;
  /** Watch subdirectories too. Defaults to `true` — set `false` for a single file. */
  readonly recursive?: boolean;
}

export interface Watcher {
  start(onChange: () => void): void;
  stop(): void;
}

interface DenoNamespace {
  watchFs(paths: string | string[]): AsyncIterable<unknown>;
}

function createFsWatcher(targets: readonly WatchTarget[]): Watcher {
  let handles: FSWatcher[] = [];

  return {
    start(onChange) {
      handles = targets
        .filter((target) => existsSync(target.path))
        .map((target) => fsWatch(target.path, { recursive: target.recursive ?? true }, () => onChange()));
    },
    stop() {
      for (const handle of handles) {
        handle.close();
      }
      handles = [];
    },
  };
}

function createDenoWatcher(targets: readonly WatchTarget[]): Watcher {
  let aborted = false;

  return {
    start(onChange) {
      const deno = (globalThis as { Deno?: DenoNamespace }).Deno;
      if (!deno) {
        return;
      }

      const paths = targets.filter((target) => existsSync(target.path)).map((target) => target.path);
      void (async () => {
        for await (const _event of deno.watchFs(paths)) {
          if (aborted) {
            break;
          }
          onChange();
        }
      })();
    },
    stop() {
      aborted = true;
    },
  };
}

/**
 * Bun and Node 22+ both implement `node:fs.watch({ recursive: true })` —
 * Bun runs it through its own native, fast implementation, Node through
 * libuv's. Deno gets its own adapter because its `node:fs` compatibility
 * layer doesn't guarantee recursive-watch parity. Selection happens once,
 * by capability (which global exists), not by branching every call site on
 * the runtime — see runtime-strategy.md.
 */
export function createWatcher(targets: readonly WatchTarget[]): Watcher {
  return detectRuntime() === "deno" ? createDenoWatcher(targets) : createFsWatcher(targets);
}
