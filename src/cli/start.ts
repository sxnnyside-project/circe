import { prepareApp } from '../application/prepare-app.js';
import { normalizeError } from '../errors/normalize-error.js';
import { exitCodeFor, renderError } from '../errors/render-error.js';
import { createLogger } from '../logging/logger.js';
import { createInteractionsHandler } from '../transport/http-handler.js';
import { startInteractionsServer } from '../transport/serve.js';

const DEFAULT_HTTP_PORT = 8787;

/**
 * Executes the `start` command to launch the bot in production mode.
 *
 * @remarks
 * **Process Semantics:**
 * - Loads `circe.config.ts`, resolves credentials, and registers all discovered modules.
 * - Spawns Discord Gateway client connection (unless `transport: 'http'`).
 * - In `'http'` or `'hybrid'` transport modes, starts an HTTP server on `httpConfig.port` (default: 8787).
 * - Hooks graceful process termination signals (`SIGINT`, `SIGTERM`).
 * - **Exit Code Contract:**
 *   - Runs indefinitely until stopped by signal or unhandled error.
 *   - On fatal startup error, sets `process.exitCode = 1` and writes diagnostic block to `process.stderr`.
 *
 * @param cwd - The project root directory to execute from.
 *
 * @example
 * ```typescript
 * import { runStart } from './start.js';
 * await runStart(process.cwd());
 * ```
 *
 * @internal
 */
export async function runStart(cwd: string): Promise<void> {
  const logger = createLogger({
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    metadata: { component: 'cli' },
  });

  try {
    const { app, transport, httpConfig } = await prepareApp(cwd, logger);
    await app.start();

    if ((transport === 'http' || transport === 'hybrid') && httpConfig) {
      const handler = createInteractionsHandler({
        client: app.client,
        publicKey: httpConfig.publicKey,
        logger,
      });
      const server = startInteractionsServer({
        port: httpConfig.port ?? DEFAULT_HTTP_PORT,
        fetch: handler,
        logger,
        onListenError: () => void app.stop(),
      });
      app.onStop(() => server.stop());
    }
  } catch (error) {
    const normalized = normalizeError(error);
    process.stderr.write(`${renderError(normalized)}\n`);
    process.exitCode = exitCodeFor(normalized);
  }
}
