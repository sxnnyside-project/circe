import { normalizeError } from '../errors/normalize-error.js';
import { createLogger } from '../logging/logger.js';
import { createInteractionsHandler } from '../transport/http-handler.js';
import { startInteractionsServer } from '../transport/serve.js';
import { prepareApp } from './prepare-app.js';
import { exitCodeFor, renderError } from './render-error.js';

const DEFAULT_HTTP_PORT = 8787;

/**
 * Loads `circe.config.ts`, scans the folders `folder-conventions.md`
 * defines (skipping any that don't exist), and starts the resulting
 * application — the CLI's declarative counterpart to calling `createCirce()`
 * and each `load()`/`start()` manually. When `transport` is `"http"` or
 * `"hybrid"`, also starts the HTTP Interactions Endpoint server after the
 * app itself has started.
 */
export async function runStart(cwd: string): Promise<void> {
  const logger = createLogger({
    // Production gets structured JSON at info level; there is no other hook for a CLI-driven bot to choose.
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    metadata: { component: 'cli' },
  });

  try {
    const { app, transport, httpConfig } = await prepareApp(cwd, logger);
    await app.start();

    if ((transport === 'http' || transport === 'hybrid') && httpConfig) {
      // `httpConfig` is guaranteed present here — `prepareApp` already
      // validated it before returning for exactly these transport modes.
      const handler = createInteractionsHandler({
        client: app.client,
        publicKey: httpConfig.publicKey,
        logger,
      });
      const server = startInteractionsServer({
        port: httpConfig.port ?? DEFAULT_HTTP_PORT,
        fetch: handler,
        logger,
      });
      // Without this the listener keeps the process alive after shutdown.
      app.onStop(() => server.stop());
    }
  } catch (error) {
    const normalized = normalizeError(error);
    process.stderr.write(`${renderError(normalized)}\n`);
    process.exitCode = exitCodeFor(normalized);
  }
}
