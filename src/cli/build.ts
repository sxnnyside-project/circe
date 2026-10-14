import { normalizeError } from '../errors/normalize-error.js';
import { createLogger } from '../logging/logger.js';
import { prepareApp } from './prepare-app.js';
import { exitCodeFor, renderError } from './render-error.js';

/**
 * Runs the same config/integration resolution and module discovery
 * `circe start` does — validating `circe.config.ts`, every command,
 * event, component, modal, and context menu command against its module
 * contract — without ever calling `app.start()`. No client, no login, no
 * Discord registration: a CI-friendly way to catch a broken module before
 * it reaches production.
 */
export async function runBuild(cwd: string): Promise<void> {
  const logger = createLogger({ metadata: { component: 'cli' } });

  try {
    const { app } = await prepareApp(cwd, logger);
    logger.info('Build check passed', {
      commands: app.commands.registry.size,
      events: app.events.registry.size,
      components: app.components.registry.size,
      modals: app.modals.registry.size,
      contextMenuCommands: app.contextMenuCommands.registry.size,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    process.stderr.write(`${renderError(normalized)}\n`);
    process.exitCode = exitCodeFor(normalized);
  }
}
