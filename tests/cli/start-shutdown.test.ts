import { describe, expect, test } from 'bun:test';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

// The temp project lives under this package so `zod` resolves from its node_modules.
const TEMP_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-cli');
const SRC = path.join(import.meta.dirname, '..', '..', 'src').replace(/\\/g, '/');

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for the bot to come up');
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

/** Runs the real `circe start` CLI against a stub Discord API, so no network or token is needed. */
async function withRunningBot(
  run: (child: ChildProcess, ports: { health: number; http: number }) => Promise<void>,
): Promise<void> {
  const api = Bun.serve({ port: 0, fetch: () => Response.json([]) });
  await mkdir(TEMP_ROOT, { recursive: true });
  const dir = await mkdtemp(path.join(TEMP_ROOT, 'start-'));
  const ports = { health: await freePort(), http: await freePort() };
  let child: ChildProcess | undefined;

  try {
    await writeProject(dir, ports, api.port ?? 0);

    child = spawn('bun', [path.join(SRC, 'cli', 'index.ts'), 'start'], {
      cwd: dir,
      env: { ...process.env, token: 'test-token', clientId: 'test-client-id' },
      stdio: 'ignore',
    });
    await waitFor(
      async () => (await fetch(`http://127.0.0.1:${ports.health}/ready`)).status === 200,
      10_000,
    );

    await run(child, ports);
  } finally {
    child?.kill('SIGKILL');
    api.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeProject(dir: string, ports: { health: number; http: number }, apiPort: number) {
  await writeFile(
    path.join(dir, 'circe.config.ts'),
    `import { defineCirceConfig } from "${SRC}/config/circe-config.js";
import { defineConfig } from "${SRC}/config/config.js";
import { z } from "zod";

export default defineCirceConfig({
  config: defineConfig(z.object({ token: z.string(), clientId: z.string() })),
  intents: [],
  transport: "http",
  http: { publicKey: "${'ab'.repeat(32)}", port: ${ports.http} },
  health: { port: ${ports.health}, host: "127.0.0.1" },
  client: { rest: { api: "http://127.0.0.1:${apiPort}/api" } },
});
`,
  );
  await mkdir(path.join(dir, 'src'), { recursive: true });
}

describe('circe start failure', () => {
  test('a rejected command registration exits non-zero on its own instead of lingering', async () => {
    const api = Bun.serve({
      port: 0,
      fetch: () => Response.json({ message: '401: Unauthorized', code: 0 }, { status: 401 }),
    });
    await mkdir(TEMP_ROOT, { recursive: true });
    const dir = await mkdtemp(path.join(TEMP_ROOT, 'fail-'));
    const ports = { health: await freePort(), http: await freePort() };
    let child: ChildProcess | undefined;

    try {
      await writeProject(dir, ports, api.port ?? 0);
      child = spawn('bun', [path.join(SRC, 'cli', 'index.ts'), 'start'], {
        cwd: dir,
        env: { ...process.env, token: 'bad-token', clientId: 'test-client-id' },
        stdio: 'ignore',
      });

      const code = await Promise.race([
        exited(child),
        new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 8_000)),
      ]);

      expect(code).not.toBe('hung');
      expect(code).not.toBe(0);
      await expect(fetch(`http://127.0.0.1:${ports.health}/health`)).rejects.toThrow();
    } finally {
      child?.kill('SIGKILL');
      api.stop(true);
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('circe start shutdown', () => {
  test('http transport: SIGTERM stops both servers and the process exits on its own', async () => {
    await withRunningBot(async (child, ports) => {
      const done = exited(child);
      const startedAt = Date.now();

      child.kill('SIGTERM');
      const code = await Promise.race([
        done,
        new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 8_000)),
      ]);

      expect(code).not.toBe('hung');
      expect(Date.now() - startedAt).toBeLessThan(8_000);
      await expect(fetch(`http://127.0.0.1:${ports.http}/`)).rejects.toThrow();
      await expect(fetch(`http://127.0.0.1:${ports.health}/health`)).rejects.toThrow();
    });
  }, 30_000);
});
