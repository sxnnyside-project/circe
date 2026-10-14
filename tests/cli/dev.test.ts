import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type DevDependencies, runDev } from '../../src/cli/dev.js';
import type { WatchTarget } from '../../src/runtime/watcher.js';

const TEMP_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-dev');

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  kills = 0;

  kill(): boolean {
    this.kills += 1;
    this.killed = true;
    // A real child exits asynchronously after the signal.
    queueMicrotask(() => {
      this.exitCode = 0;
      this.emit('exit', 0);
    });
    return true;
  }
}

function harness() {
  const children: FakeChild[] = [];
  const targets: WatchTarget[][] = [];
  let notify: () => void = () => {};
  const exits: number[] = [];
  const dependencies: DevDependencies = {
    spawn: () => {
      const child = new FakeChild();
      children.push(child);
      return child as unknown as ChildProcess;
    },
    createWatcher: (watched) => {
      targets.push([...watched]);
      return {
        start: (onChange) => {
          notify = onChange;
        },
        stop: () => {},
      };
    },
    exit: (code) => exits.push(code),
  };
  return { children, targets, exits, dependencies, change: () => notify() };
}

let project: string;
const stops: (() => void)[] = [];

beforeEach(async () => {
  await mkdir(TEMP_ROOT, { recursive: true });
  project = await mkdtemp(path.join(TEMP_ROOT, 'run-'));
  await writeFile(path.join(project, 'circe.config.ts'), 'export default { scanRoot: "./bot" };');
});

afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  await rm(project, { recursive: true, force: true });
  await rm(TEMP_ROOT, { recursive: true, force: true });
});

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

describe('runDev', () => {
  test('starts one child and watches the scan root and the config file', async () => {
    const h = harness();
    stops.push((await runDev(project, h.dependencies)) as () => void);

    expect(h.children).toHaveLength(1);
    expect(h.targets[0]).toEqual([
      { path: path.join(project, 'bot') },
      { path: path.join(project, 'circe.config.ts'), recursive: false },
    ]);
  });

  test('a burst of changes restarts the child once: old one killed, new one spawned', async () => {
    const h = harness();
    stops.push((await runDev(project, h.dependencies)) as () => void);

    h.change();
    h.change();
    h.change();
    await settle();

    expect(h.children).toHaveLength(2);
    expect(h.children[0]?.kills).toBe(1);
  });

  test('stop() kills the running child and signals exit(0) through the signal path', async () => {
    const h = harness();
    const stop = (await runDev(project, h.dependencies)) as () => void;

    process.emit('SIGTERM');

    expect(h.children[0]?.kills).toBe(1);
    expect(h.exits).toEqual([0]);
    stop();
  });

  test('reports a missing circe.config.ts with exit code 1 and starts nothing', async () => {
    const h = harness();
    const empty = await mkdtemp(path.join(TEMP_ROOT, 'empty-'));
    const previousExitCode = process.exitCode;

    const stop = await runDev(empty, h.dependencies);

    expect(stop).toBeUndefined();
    expect(h.children).toHaveLength(0);
    expect(process.exitCode).toBe(1);
    process.exitCode = previousExitCode ?? 0;
  });
});
