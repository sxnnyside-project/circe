import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CirceConfigFile } from "../config/circe-config.js";
import { createWatcher } from "../runtime/watcher.js";

const CONFIG_FILE_NAME = "circe.config.ts";
const RESTART_DEBOUNCE_MS = 150;

/**
 * Watches `scanRoot` and `circe.config.ts` and re-runs `circe start` as a
 * fresh child process on every change — a full process restart, never an
 * in-process re-import, so every restart gets a clean module cache with no
 * risk of stale state carried over from the previous run.
 */
export async function runDev(cwd: string): Promise<void> {
  const configFilePath = path.join(cwd, CONFIG_FILE_NAME);

  if (!existsSync(configFilePath)) {
    process.stderr.write(`✗ ${CONFIG_FILE_NAME} not found in ${cwd}\n`);
    process.exitCode = 1;
    return;
  }

  const imported = (await import(pathToFileURL(configFilePath).href)) as {
    // biome-ignore lint/suspicious/noExplicitAny: schema type is only known once loaded
    default?: CirceConfigFile<any>;
  };

  if (imported.default === undefined) {
    process.stderr.write(`✗ ${CONFIG_FILE_NAME}\n  Must have a default export produced by defineCirceConfig(...).\n`);
    process.exitCode = 1;
    return;
  }

  const scanRoot = path.resolve(cwd, imported.default.scanRoot ?? "./src");
  const cliEntryPath = fileURLToPath(new URL("./index.js", import.meta.url));

  let child: ChildProcess | undefined;
  let pendingRestart = false;
  let debounceTimer: NodeJS.Timeout | undefined;

  const spawnChild = (): void => {
    process.stderr.write("→ starting\n");
    child = spawn(process.execPath, [cliEntryPath, "start"], { cwd, stdio: "inherit" });
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
      process.stderr.write("→ change detected, restarting\n");

      const previous = child;
      if (previous && previous.exitCode === null && !previous.killed) {
        previous.once("exit", () => {
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

  const watcher = createWatcher([{ path: scanRoot }, { path: configFilePath, recursive: false }]);
  watcher.start(scheduleRestart);

  const shutdown = (): void => {
    watcher.stop();
    child?.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  spawnChild();
}
