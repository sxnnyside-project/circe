#!/usr/bin/env bun
/**
 * Cross-runtime HTTP Interactions transport benchmark.
 *
 * Starts `server.mjs` (the built `createInteractionsHandler` +
 * `startInteractionsServer`, unmodified) as its own child process under
 * Bun, Node, and Deno in turn, fires a fixed number of signed `PING`
 * requests at each with a fixed concurrency, and reports throughput and
 * latency. One runtime at a time, one child process per runtime, so no
 * runtime's JIT/GC warm-up or event loop contends with another's.
 *
 * Requires the real `deno`/`node` binaries on PATH; `bun` is required
 * unconditionally since this script itself runs under it. A missing
 * runtime binary is skipped (not failed) — same policy as
 * `tests/transport/deno-runtime.test.ts` — since not every machine running
 * this benchmark has all three installed.
 */
import { $ } from 'bun';

const PORT_BASE = 9970;
const WARMUP_REQUESTS = 200;
const TOTAL_REQUESTS = 5000;
const CONCURRENCY = 50;

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildSignedPing() {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = toHex(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = toHex(
    await crypto.subtle.sign(
      'Ed25519',
      keyPair.privateKey,
      new TextEncoder().encode(timestamp + body),
    ),
  );
  return { publicKey, timestamp, body, signature };
}

async function waitForServer(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'POST', headers: {}, body: '' });
      // Any response at all (even a 401 for missing signature) means the
      // server is up — we only need liveness here, not a valid handshake.
      if (res.status) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function fireRequest(url, headers, body) {
  const start = performance.now();
  const res = await fetch(url, { method: 'POST', headers, body });
  await res.arrayBuffer();
  const elapsed = performance.now() - start;
  return { ok: res.status === 200, elapsed };
}

async function runLoad(url, headers, body, count) {
  const latencies = [];
  let failures = 0;
  let inFlight = 0;
  let launched = 0;

  await new Promise((resolve, reject) => {
    function launchNext() {
      if (launched >= count) {
        if (inFlight === 0) resolve();
        return;
      }
      launched++;
      inFlight++;
      fireRequest(url, headers, body)
        .then((result) => {
          if (!result.ok) failures++;
          latencies.push(result.elapsed);
        })
        .catch(() => {
          failures++;
        })
        .finally(() => {
          inFlight--;
          launchNext();
        });
    }

    try {
      for (let i = 0; i < CONCURRENCY; i++) launchNext();
    } catch (error) {
      reject(error);
    }
  });

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  return { failures, p50, p95, p99 };
}

async function benchmarkRuntime(name, command, args, port) {
  const binary = await Bun.which(command);
  if (!binary) {
    return { name, skipped: true };
  }

  const signed = await buildSignedPing();
  const url = `http://localhost:${port}/interactions`;
  const headers = {
    'x-signature-ed25519': signed.signature,
    'x-signature-timestamp': signed.timestamp,
    'content-type': 'application/json',
  };

  const proc = Bun.spawn([command, ...args, 'scripts/bench/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, BENCH_PORT: String(port), BENCH_PUBLIC_KEY: signed.publicKey },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    await waitForServer(url);

    // Warm-up: let each runtime JIT the handler path before the timed run,
    // so the comparison reflects steady-state throughput, not cold-start.
    await runLoad(url, headers, signed.body, WARMUP_REQUESTS);

    const start = performance.now();
    const { failures, p50, p95, p99 } = await runLoad(url, headers, signed.body, TOTAL_REQUESTS);
    const totalSeconds = (performance.now() - start) / 1000;
    const requestsPerSecond = TOTAL_REQUESTS / totalSeconds;

    return { name, skipped: false, requestsPerSecond, p50, p95, p99, failures };
  } finally {
    proc.kill();
    await proc.exited;
  }
}

async function main() {
  const distIndex = Bun.file('dist/index.js');
  if (!(await distIndex.exists())) {
    console.log('dist/index.js not found — building first...');
    await $`bun run build`.quiet();
  }

  const runtimes = [
    { name: 'Bun', command: 'bun', args: [], port: PORT_BASE },
    { name: 'Node', command: 'node', args: [], port: PORT_BASE + 1 },
    {
      name: 'Deno',
      command: 'deno',
      args: ['run', '--allow-net', '--allow-env'],
      port: PORT_BASE + 2,
    },
  ];

  const results = [];
  for (const runtime of runtimes) {
    console.log(`\nRunning ${runtime.name}...`);
    const result = await benchmarkRuntime(
      runtime.name,
      runtime.command,
      runtime.args,
      runtime.port,
    );
    results.push(result);
    if (result.skipped) {
      console.log(`  skipped — '${runtime.command}' not found on PATH`);
    } else {
      console.log(
        `  ${result.requestsPerSecond.toFixed(0)} req/s | p50 ${result.p50.toFixed(2)}ms | p95 ${result.p95.toFixed(2)}ms | p99 ${result.p99.toFixed(2)}ms | failures ${result.failures}`,
      );
    }
  }

  console.log('\n| Runtime | req/s | p50 (ms) | p95 (ms) | p99 (ms) | failures |');
  console.log('| :--- | ---: | ---: | ---: | ---: | ---: |');
  for (const result of results) {
    if (result.skipped) {
      console.log(`| ${result.name} | skipped | — | — | — | — |`);
    } else {
      console.log(
        `| ${result.name} | ${result.requestsPerSecond.toFixed(0)} | ${result.p50.toFixed(2)} | ${result.p95.toFixed(2)} | ${result.p99.toFixed(2)} | ${result.failures} |`,
      );
    }
  }
}

await main();
