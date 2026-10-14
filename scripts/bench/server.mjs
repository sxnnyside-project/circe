// Standalone HTTP Interactions server for the cross-runtime benchmark.
//
// Imports from `../../dist`, not `src/` — the point is to measure what a
// deployed bot actually runs (`createInteractionsHandler` +
// `startInteractionsServer` hosted by whichever of `Bun.serve`/`Deno.serve`/
// the `node:http` bridge the detected runtime picks), not the TypeScript
// source. Plain `.mjs`, no TypeScript syntax, so Bun/Node/Deno all run it
// identically with zero transpilation step to skew the comparison. Started
// fresh as a child process per runtime by `run.mjs`, one runtime at a time,
// so results never share a process (and its JIT/GC warm-up state) across
// runtimes.
//
// Only `PING` requests are exercised (see run.mjs) so a real discord.js
// `Client` is never needed — the object below only has to satisfy the
// shape `createInteractionsHandler` reads, and PING responses never touch it.
import { createInteractionsHandler, startInteractionsServer } from '../../dist/index.js';

const port = Number(process.env.BENCH_PORT ?? 0);
const publicKey = process.env.BENCH_PUBLIC_KEY ?? '';

if (!port || !publicKey) {
  throw new Error('BENCH_PORT and BENCH_PUBLIC_KEY must be set');
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const handler = createInteractionsHandler({
  client: {},
  publicKey,
  logger: silentLogger,
});

startInteractionsServer({ port, fetch: handler, logger: silentLogger });

process.stdout.write('ready\n');
