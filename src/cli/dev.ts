import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { normalizeError } from '../errors/normalize-error.js';
import { createWatcher, type Watcher, type WatchTarget } from '../runtime/watcher.js';
import { loadConfigFile } from './prepare-app.js';
import { exitCodeFor, renderError } from './render-error.js';

const RESTART_DEBOUNCE_MS = 150;

/** The process-level pieces `runDev` drives, replaceable so the restart logic can be tested. */
export interface DevDependencies {
  readonly spawn: (cwd: string) => ChildProcess;
  readonly createWatcher: (targets: readonly WatchTarget[]) => Watcher;
  readonly exit: (code: number) => void;
}

const defaultDependencies: DevDependencies = {
  // The running script is the CLI itself, however the bundler laid its modules out.
  spawn: (cwd) =>
    spawn(process.execPath, [process.argv[1] ?? '', 'start'], { cwd, stdio: 'inherit' }),
  createWatcher,
  exit: (code) => process.exit(code),
};

/**
 * Watches `scanRoot` and `circe.config.ts` and re-runs `circe start` as a
 * fresh child process on every change — a full process restart, never an
 * in-process re-import, so every restart gets a clean module cache with no
 * risk of stale state carried over from the previous run.
 *
 * Resolves to a `stop` function (also what SIGINT/SIGTERM trigger); resolves
 * to `undefined` after reporting when the config cannot be loaded.
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

  const spawnChild = (): void => {
    process.stderr.write('→ starting\n');
    child = dependencies.spawn(cwd);
  };

  const scheduleRestart = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      if (pendingRestart) {
        return;
      }
      pendingRestart = true;
      process.stderr.write('→ change detected, restarting\n');

      const previous = child;
      if (previous && previous.exitCode === null && !previous.killed) {
        previous.once('exit', () => {
          pendingRestart = false;
          spawnChild();
        });
        previous.kill();
      } else {
        pendingRestart = false;
        spawnChild();
      }
    }, RESTART_DEBOUNCE_MS);
  };

  const watcher = dependencies.createWatcher([
    { path: scanRoot },
    { path: configFilePath, recursive: false },
  ]);
  watcher.start(scheduleRestart);

  const stop = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    watcher.stop();
    child?.kill();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };
  const onSignal = (): void => {
    stop();
    dependencies.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  spawnChild();
  return stop;
}
