# Cross-Runtime Benchmark

Measures the one piece of Circe that actually runs different code per runtime: the HTTP Interactions transport (`createInteractionsHandler` + `startInteractionsServer`, see `docs/architecture/runtime-strategy.md`). Everything else — routers, guards, the paginator, the CLI's module scanning — is the same code on every runtime; only the server adapter changes (`Bun.serve`, `Deno.serve`, or the `node:http` bridge).

## Method

`bun run bench` (`scripts/bench/run.mjs`) builds `dist/`, then for each runtime in turn:

1. Spawns `scripts/bench/server.mjs` — the built, unmodified transport, hosting a stub `Client` (only `PING` requests are sent, so a real discord.js gateway connection is never needed).
2. Fires 200 warm-up requests (JIT/connection-pool warm-up, discarded).
3. Fires 5,000 signed `PING` requests at concurrency 50, measuring wall-clock throughput and per-request latency.
4. Kills the process before moving to the next runtime — one runtime, one process, one measurement window, no shared state or GC pressure carried over.

Run it yourself: `bun run bench` (requires `bun`; `node` and `deno` are each skipped, not failed, if not found on `PATH`).

## Results

Apple Silicon Mac, two consecutive runs:

| Runtime | req/s | p50 (ms) | p95 (ms) | p99 (ms) | failures |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Bun | 56,456 – 56,826 | 0.91 – 0.93 | 1.09 – 1.13 | 1.98 – 2.25 | 0 |
| Deno | 26,723 – 27,833 | 1.79 – 1.81 | 2.35 – 2.51 | 2.69 – 2.98 | 0 |
| Node | 16,374 – 16,473 | 2.84 – 2.85 | 4.41 – 4.49 | 5.90 – 7.19 | 0 |

## Reading this

- **Bun leads by ~2x over Deno and ~3.5x over Node** on this workload, consistent with `Bun.serve`'s reputation for the lowest-overhead HTTP server among the three — expected, and the reason Circe treats Bun as its primary runtime.
- **Node's `node:http` bridge is the slowest by design**: it's the one runtime here without a native "serve this Fetch handler" API, so every request pays for a `IncomingMessage`/`ServerResponse` → `Request`/`Response` conversion (`transport/serve.ts`'s `nodeRequestToWebRequest`/`writeWebResponseToNode`) that Bun and Deno skip entirely.
- **Zero failures on all three** is the more important number for a Discord bot framework: Discord's Interactions Endpoint gives a bot a few seconds to respond, not microseconds — every runtime here clears that bar by a wide margin. This benchmark is about relative overhead, not about any runtime being "too slow" to run a production bot.
- These numbers describe one localhost round-trip of the transport layer only — not command execution time, not a bot's own handler logic, and not real network latency to Discord's servers, which will dominate actual production request time regardless of runtime.
