import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { loadConfigFile } from '../application/prepare-app.js';
import { normalizeError } from '../errors/normalize-error.js';
import { exitCodeFor, renderError } from '../errors/render-error.js';
import { createWatcher, type Watcher, type WatchTarget } from '../runtime/watcher.js';

const RESTART_DEBOUNCE_MS = 150;

/**
 * Dependency injection hooks for `runDev`, permitting isolated testing of process supervisor logic.
 *
 * @internal
 */
export interface DevDependencies {
  /** Spawns a child process executing `circe start`. */
  readonly spawn: (cwd: string) => ChildProcess;
  /** Creates a filesystem watcher watching configured directories. */
  readonly createWatcher: (targets: readonly WatchTarget[]) => Watcher;
  /** Process exit hook. */
  readonly exit: (code: number) => void;
}

const defaultDependencies: DevDependencies = {
  spawn: (cwd) =>
    spawn(process.execPath, [process.argv[1] ?? '', 'start'], { cwd, stdio: 'inherit' }),
  createWatcher,
  exit: (code) => process.exit(code),
};

/**
 * Executes the `dev` command, establishing a supervisor watcher that restarts the bot on changes.
 *
 * @remarks
 * **Process Semantics:**
 * - Spawns a child process running `circe start` with inherited stdio.
 * - Watches `circe.config.ts` and the configured `scanRoot` (default: `./src`).
 * - **Full Process Isolation:** Restarts perform a complete subprocess termination and respawn,
 *   guaranteeing a clean module cache with zero memory leaks or stale Discord event listeners.
 * - Debounces rapid file changes (`150ms`).
 * - Intercepts `SIGINT` and `SIGTERM` to gracefully kill the supervised child process.
 *
 * @param cwd - The project root directory to supervise.
 * @param dependencies - Optional dependency injection overrides for test suites.
 * @returns A promise resolving to a cleanup function, or `undefined` if startup validation failed.
 *
 * @internal
 */
export async function runDev(
  cwd: string,
  dependencies: DevDependencies = defaultDependencies,
): Promise<(() => void) | undefined> {
  let scanRoot: string;
  let configFilePath: string;
  try {
    const { configFile, filePath } = await loadConfigFile(cwd);
    configFilePath = filePath;
    scanRoot = path.resolve(cwd, configFile.scanRoot ?? './src');
  } catch (error) {
    const normalized = normalizeError(error);
    process.stderr.write(`${renderError(normalized)}\n`);
    process.exitCode = exitCodeFor(normalized);
    return undefined;
  }

  let child: ChildProcess | undefined;
  let pendingRestart = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // `onChildExit` must be attached to every child, not only the first: a later
  // restart or crash would otherwise leave the supervisor waiting on a dead process.
  const spawnChild = (): void => {
    process.stderr.write('→ starting\n');
    child = dependencies.spawn(cwd);
    child.on('exit', onChildExit);
  };

  const scheduleRestart = (): void => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      if (child === undefined) {
        spawnChild();
        return;
      }
      pendingRestart = true;
      process.stderr.write('→ change detected, restarting\n');
      child.kill('SIGTERM');
      const fallback = setTimeout(() => {
        child?.kill('SIGKILL');
      }, 5_000);
      child.once('exit', () => clearTimeout(fallback));
    }, RESTART_DEBOUNCE_MS);
  };

  const watcher = dependencies.createWatcher([
    { path: scanRoot },
    { path: configFilePath, recursive: false },
  ]);
  watcher.start(() => scheduleRestart());

  const onChildExit = (): void => {
    child = undefined;
    if (pendingRestart) {
      pendingRestart = false;
      spawnChild();
    }
  };

  spawnChild();

  const stop = (): void => {
    watcher.stop();
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    child?.kill('SIGTERM');
  };

  process.once('SIGINT', () => {
    stop();
    dependencies.exit(0);
  });
  process.once('SIGTERM', () => {
    stop();
    dependencies.exit(0);
  });

  return stop;
}
