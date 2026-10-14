import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CirceApp, CirceCredentials } from '../application/app.js';
import { createCirce } from '../application/app.js';
import type { ErrorBoundaryModule } from '../application/error-boundary.js';
import type { MiddlewareModule } from '../application/middleware.js';
import type {
  CirceConfigFile,
  HttpTransportConfig,
  TransportMode,
} from '../config/circe-config.js';
import { resolveIntegrations, type ScanCategory } from '../config/integration.js';
import { CirceError } from '../errors/circe-error.js';
import type { I18nResolver } from '../i18n/types.js';
import type { Logger } from '../logging/logger.js';

const CONFIG_FILE_NAME = 'circe.config.ts';
const MIDDLEWARE_FILE_NAME = 'middleware.ts';
const ERROR_BOUNDARY_FILE_NAME = 'error.ts';
const I18N_FILE_NAME = 'i18n.ts';

/** Raised when `circe.config.ts` is missing from the project root. */
export class ConfigFileNotFoundError extends CirceError {}

/** Raised when `circe.config.ts` doesn't export a default produced by `defineCirceConfig(...)`. */
export class ConfigFileInvalidError extends CirceError {}

const LOADERS: Record<ScanCategory, (app: CirceApp, directory: string) => Promise<void>> = {
  commands: (app, directory) => app.commands.load(directory),
  'command-groups': (app, directory) => app.commandGroups.load(directory),
  'context-menus': (app, directory) => app.contextMenuCommands.load(directory),
  events: (app, directory) => app.events.load(directory),
  components: (app, directory) => app.components.load(directory),
  modals: (app, directory) => app.modals.load(directory),
};

async function loadOptionalModule<T>(filePath: string): Promise<T | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }
  const imported = (await import(pathToFileURL(filePath).href)) as { default?: T };
  return imported.default;
}

/**
 * Node runs TypeScript natively only from 22.18 (22.6+ behind a flag); on an
 * older Node the bare `Unknown file extension ".ts"` says nothing a bot
 * author can act on.
 */
async function importConfigFile(filePath: string): Promise<unknown> {
  try {
    return await import(pathToFileURL(filePath).href);
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      throw new ConfigFileInvalidError(
        `${CONFIG_FILE_NAME} is TypeScript and this runtime cannot load it. Use Node.js 22.18 or later, Bun, or Deno.`,
        { cause: error, metadata: { file: filePath } },
      );
    }
    throw error;
  }
}

function countRegisteredModules(app: CirceApp): number {
  return (
    app.commands.registry.size +
    app.events.registry.size +
    app.components.registry.size +
    app.modals.registry.size +
    app.contextMenuCommands.registry.size
  );
}

export interface PreparedApp {
  readonly app: CirceApp;
  readonly scanRoot: string;
  readonly transport: TransportMode;
  readonly httpConfig: HttpTransportConfig | undefined;
}

/**
 * Loads `circe.config.ts`, resolves integrations, discovers the optional
 * `middleware.ts`/`error.ts`/`i18n.ts` at the scan root, and scans every
 * module category — everything `circe start` and `circe build` share. Never
 * calls `app.start()`: that's the one thing left for each to do
 * differently (or, for `circe build`, not do at all).
 */
export async function prepareApp(cwd: string, logger: Logger): Promise<PreparedApp> {
  const configFilePath = path.join(cwd, CONFIG_FILE_NAME);

  if (!existsSync(configFilePath)) {
    throw new ConfigFileNotFoundError(`${CONFIG_FILE_NAME} not found in ${cwd}`, {
      metadata: { file: configFilePath },
    });
  }

  // Dynamic import crosses the type boundary into the developer's own
  // module — its shape is asserted, not statically known, the same way
  // `discoverModules` treats every module it imports.
  const imported = (await importConfigFile(configFilePath)) as {
    // biome-ignore lint/suspicious/noExplicitAny: schema type is only known once loaded
    default?: CirceConfigFile<any>;
  };

  if (imported.default === undefined) {
    throw new ConfigFileInvalidError(
      `${CONFIG_FILE_NAME} must have a default export produced by defineCirceConfig(...)`,
      { metadata: { file: configFilePath } },
    );
  }

  const configFile = imported.default;
  const config = configFile.config.load() as CirceCredentials;
  const scanRoot = path.resolve(cwd, configFile.scanRoot ?? './src');
  const resolved = await resolveIntegrations(configFile.integrations);
  const transport = configFile.transport ?? 'gateway';

  if ((transport === 'http' || transport === 'hybrid') && !configFile.http?.publicKey) {
    throw new ConfigFileInvalidError(
      `transport "${transport}" requires an \`http: { publicKey }\` block in ${CONFIG_FILE_NAME}`,
      { metadata: { file: configFilePath } },
    );
  }

  const middleware = await loadOptionalModule<MiddlewareModule>(
    path.join(scanRoot, MIDDLEWARE_FILE_NAME),
  );
  const errorBoundary = await loadOptionalModule<ErrorBoundaryModule>(
    path.join(scanRoot, ERROR_BOUNDARY_FILE_NAME),
  );
  const i18n = await loadOptionalModule<I18nResolver>(path.join(scanRoot, I18N_FILE_NAME));

  const app = createCirce({
    config,
    intents: configFile.intents,
    ...(configFile.client !== undefined ? { client: configFile.client } : {}),
    ...(configFile.health !== undefined ? { health: configFile.health } : {}),
    ...(configFile.onUnhandledRejection !== undefined
      ? { onUnhandledRejection: configFile.onUnhandledRejection }
      : {}),
    ...(configFile.shutdownTimeoutMs !== undefined
      ? { shutdownTimeoutMs: configFile.shutdownTimeoutMs }
      : {}),
    logger,
    // "http"-only transport never opens a gateway connection; "hybrid" still does, for every non-interaction event.
    autoLogin: transport !== 'http',
    ...(middleware !== undefined ? { middleware } : {}),
    ...(i18n !== undefined ? { i18n } : {}),
    ...errorBoundary,
  });

  for (const hook of resolved.onStartHooks) {
    app.onStart(hook);
  }
  for (const hook of resolved.onStopHooks) {
    app.onStop(hook);
  }
  for (const hook of resolved.onReadyHooks) {
    app.onReady(hook);
  }
  for (const { intervalMs, task, options } of resolved.intervals) {
    app.every(intervalMs, task, options);
  }

  for (const [category, load] of Object.entries(LOADERS) as [
    ScanCategory,
    (typeof LOADERS)[ScanCategory],
  ][]) {
    const directories = [path.join(scanRoot, category), ...resolved.scanRoots[category]];
    for (const directory of directories) {
      if (existsSync(directory)) {
        await load(app, directory);
      }
    }
  }

  if (countRegisteredModules(app) === 0) {
    logger.warn(`No commands, events, components, or modals discovered under ${scanRoot}`, {
      scanRoot,
      hint: 'check `scanRoot` in circe.config.ts if this is unexpected',
    });
  }

  return { app, scanRoot, transport, httpConfig: configFile.http };
}
