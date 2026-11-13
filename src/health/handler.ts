import type { Client } from 'discord.js';
import type { Logger } from '../logging/logger.js';

/**
 * A synchronous or asynchronous health check predicate for a named subsystem
 * (database reachable, Redis connection live, external API healthy).
 *
 * @returns `true` if the subsystem is healthy, `false` otherwise.
 * @public
 */
export type HealthCheck = () => boolean | Promise<boolean>;

/**
 * Status reported by health and readiness probes.
 *
 * @remarks
 * - `'alive'`: Process is running and event loop is processing requests (`/health`).
 * - `'starting'`: Application startup sequence or Gateway connection in progress (`/ready`).
 * - `'ready'`: Application running and all subsystem checks passing (`/ready`).
 * - `'unavailable'`: One or more subsystem readiness checks failed or timed out (`/ready`).
 * - `'not-found'`: Requested route is not a recognized health probe path.
 *
 * @public
 */
export type HealthProbeStatus = 'alive' | 'starting' | 'ready' | 'unavailable' | 'not-found';

/**
 * Structured response payload returned by `/health` and `/ready`.
 *
 * @public
 */
export interface HealthProbeResponse {
  /** High-level operational status of the service. */
  readonly status: HealthProbeStatus;

  /**
   * Status breakdown of individual named checks for `/ready`.
   *
   * @defaultValue `undefined`
   */
  readonly checks?: Readonly<Record<string, 'ok' | 'failed'>>;
}

/**
 * Configuration options for the health and readiness probe HTTP server.
 *
 * @public
 */
export interface HealthConfig {
  /**
   * Port the health server listens on.
   *
   * @remarks
   * Required: a health endpoint without an explicit port is unpredictable in container deployments.
   */
  readonly port: number;

  /**
   * Interface to bind, e.g. `"127.0.0.1"` to keep probe local to container.
   *
   * @defaultValue `"0.0.0.0"` (all interfaces)
   */
  readonly host?: string;

  /**
   * Named readiness checks (database reachable, upstream API up). Each runs on
   * every `/ready` request; a check that returns `false`, throws, or takes
   * longer than `checkTimeoutMs` marks the process not ready.
   *
   * @defaultValue `{}`
   */
  readonly checks?: Readonly<Record<string, HealthCheck>>;

  /**
   * Per-check execution budget in milliseconds.
   *
   * @defaultValue `2000`
   */
  readonly checkTimeoutMs?: number;
}

/**
 * Parameters for creating the health probe HTTP handler.
 *
 * @public
 */
export interface HealthHandlerOptions {
  /** Discord.js client instance whose readiness is inspected for `/ready`. */
  readonly client: Client;

  /**
   * `false` when no gateway login is expected (HTTP-only transport, tests):
   * the client is then never required to be ready.
   *
   * @defaultValue `true`
   */
  readonly expectGateway: boolean;

  /**
   * Callback returning `true` once the application's start sequence has finished.
   */
  readonly isRunning: () => boolean;

  /** Health probe server configuration. */
  readonly config: HealthConfig;

  /** Logger instance for health probe diagnostics and warnings. */
  readonly logger: Logger;
}

const DEFAULT_CHECK_TIMEOUT_MS = 2000;
/** How long a readiness result is reused, so a probe flood cannot turn into a check flood. */
const READY_CACHE_MS = 1000;

/** Probe responses must never be cached by reverse proxies, load balancers, or CDNs. */
const CACHE_CONTROL_HEADER = 'no-store, no-cache, must-revalidate';

async function runCheck(
  name: string,
  check: HealthCheck,
  timeoutMs: number,
  logger: Logger,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });

    // Safely wrap check in a promise, casting result to boolean and catching errors
    // so background executions never produce unhandled rejections if timeout wins.
    const checkPromise = Promise.resolve()
      .then(check)
      .then((result) => Boolean(result))
      .catch((error: unknown) => {
        logger.warn(`Health check "${name}" threw`, { error });
        return false;
      });

    return await Promise.race([checkPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function jsonResponse(body: unknown, status: number, isHead = false): Response {
  return new Response(isHead ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': CACHE_CONTROL_HEADER,
    },
  });
}

/**
 * Portable `(Request) => Promise<Response>` handler for unauthenticated infrastructure probes.
 *
 * Differentiates strictly between:
 * 1. **Liveness Probe (`/health`):**
 *    - Asserts that the process is alive, the event loop is responsive, and HTTP requests are processed.
 *    - Returns `200 { status: "alive" }` even while the bot is still connecting or warming up caches.
 *    - Used by container orchestrators (Kubernetes `livenessProbe`, Docker HEALTHCHECK, Coolify) to
 *      know whether the process is frozen and must be restarted.
 *
 * 2. **Readiness Probe (`/ready`):**
 *    - Asserts that the application is fully started, the Discord Gateway connection is established
 *      (unless running in Gateway-less HTTP mode), and all registered subsystem checks (DB, Redis, etc.) pass.
 *    - Returns `503 { status: "starting" }` during boot.
 *    - Returns `503 { status: "unavailable", checks }` if any registered health check fails or times out.
 *    - Returns `200 { status: "ready", checks }` only when 100% ready to handle real workloads.
 *    - Used by container orchestrators (Kubernetes `readinessProbe`, AWS ALB, load balancers) to route traffic.
 *
 * Rejects any method other than `GET` and `HEAD` with `405 Method Not Allowed`.
 * Any unhandled path returns `404 Not Found`.
 *
 * @example
 * ```ts
 * const handler = createHealthHandler({
 *   client,
 *   expectGateway: true,
 *   isRunning: () => true,
 *   config: { port: 8080, checks: { db: () => checkDatabase() } },
 *   logger,
 * });
 * ```
 *
 * @param options - Health probe configuration and dependency options.
 * @returns Standard Web Request to Response async handler.
 * @public
 */
export function createHealthHandler(
  options: HealthHandlerOptions,
): (request: Request) => Promise<Response> {
  const { config, client, logger } = options;
  const timeoutMs = config.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  let cached: { at: number; results: Promise<(readonly [string, boolean])[]> } | undefined;

  return async (request: Request): Promise<Response> => {
    const isGet = request.method === 'GET';
    const isHead = request.method === 'HEAD';

    if (!isGet && !isHead) {
      return new Response(null, {
        status: 405,
        headers: {
          allow: 'GET, HEAD',
          'cache-control': CACHE_CONTROL_HEADER,
        },
      });
    }

    const { pathname } = new URL(request.url, 'http://localhost');

    // --- LIVENESS PROBE: Process is alive and accepting traffic ---
    if (pathname === '/health') {
      return jsonResponse({ status: 'alive' }, 200, isHead);
    }

    // --- READINESS PROBE: Bot lifecycle finished, Gateway connected, subsystem checks passing ---
    if (pathname === '/ready') {
      if (!options.isRunning() || (options.expectGateway && !client.isReady())) {
        return jsonResponse({ status: 'starting' }, 503, isHead);
      }

      const now = Date.now();
      if (!cached || now - cached.at >= READY_CACHE_MS) {
        const entries = Object.entries(config.checks ?? {});
        cached = {
          at: now,
          results: Promise.all(
            entries.map(
              async ([name, check]) =>
                [name, await runCheck(name, check, timeoutMs, logger)] as const,
            ),
          ),
        };
      }
      const results = await cached.results;
      const checks = Object.fromEntries(results.map(([name, ok]) => [name, ok ? 'ok' : 'failed']));
      const ready = results.every(([, ok]) => ok);
      return jsonResponse(
        { status: ready ? 'ready' : 'unavailable', checks },
        ready ? 200 : 503,
        isHead,
      );
    }

    return jsonResponse({ status: 'not-found' }, 404, isHead);
  };
}
