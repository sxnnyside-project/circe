import type { Client } from 'discord.js';
import type { Logger } from '../logging/logger.js';

export type HealthCheck = () => boolean | Promise<boolean>;

export interface HealthConfig {
  /** Port the health server listens on. Required: a health endpoint with no declared port is a surprise. */
  readonly port: number;
  /** Interface to bind, e.g. `"127.0.0.1"` to keep the probe local to the container. Defaults to all interfaces. */
  readonly host?: string;
  /**
   * Named readiness checks (database reachable, upstream API up). Each runs on
   * every `/ready` request; a check that returns `false`, throws, or takes
   * longer than `checkTimeoutMs` marks the process not ready.
   */
  readonly checks?: Readonly<Record<string, HealthCheck>>;
  /** Per-check budget. Defaults to 2000ms. */
  readonly checkTimeoutMs?: number;
}

export interface HealthHandlerOptions {
  readonly client: Client;
  /** `false` when no gateway login is expected (HTTP-only transport, tests): the client is then never required to be ready. */
  readonly expectGateway: boolean;
  /** `true` once the application's start sequence has finished. */
  readonly isRunning: () => boolean;
  readonly config: HealthConfig;
  readonly logger: Logger;
}

const DEFAULT_CHECK_TIMEOUT_MS = 2000;
/** How long a readiness result is reused, so a probe flood cannot turn into a check flood. */
const READY_CACHE_MS = 1000;

async function runCheck(
  name: string,
  check: HealthCheck,
  timeoutMs: number,
  logger: Logger,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    return await Promise.race([Promise.resolve().then(check), timeout]);
  } catch (error) {
    logger.warn(`Health check "${name}" threw`, { error });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Portable `(Request) => Response` handler for two unauthenticated probes:
 * `/health` (liveness — the process answers) and `/ready` (readiness — the
 * application finished starting, the gateway is connected when one is
 * expected, and every configured check passes). Anything else is a 404, so
 * the endpoint never grows into a general HTTP surface.
 */
export function createHealthHandler(
  options: HealthHandlerOptions,
): (request: Request) => Promise<Response> {
  const { config, client, logger } = options;
  const timeoutMs = config.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  let cached: { at: number; results: Promise<(readonly [string, boolean])[]> } | undefined;

  return async (request) => {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      return json({ status: 'alive' }, 200);
    }

    if (pathname === '/ready') {
      if (!options.isRunning() || (options.expectGateway && !client.isReady())) {
        return json({ status: 'starting' }, 503);
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
      return json({ status: ready ? 'ready' : 'unavailable', checks }, ready ? 200 : 503);
    }

    return json({ status: 'not-found' }, 404);
  };
}
