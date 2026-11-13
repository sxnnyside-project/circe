import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  CirceConfigFile,
  HttpTransportConfig,
  TransportMode,
} from '../config/circe-config.js';
import { resolveIntegrations, type ScanCategory } from '../config/integration.js';
import { CirceError } from '../errors/circe-error.js';
import type { LocalizationResolver } from '../localization/resolver.js';
import type { Logger } from '../logging/logger.js';
import type { CirceApp, CirceCredentials } from './app.js';
import { createCirce } from './app.js';
import type { ErrorBoundaryModule } from './error-boundary.js';
import type { MiddlewareModule } from './middleware.js';

const CONFIG_FILE_NAME = 'circe.config.ts';
const MIDDLEWARE_FILE_NAME = 'middleware.ts';
const ERROR_BOUNDARY_FILE_NAME = 'error.ts';
const LOCALIZATION_FILE_NAME = 'localization.ts';
const I18N_FILE_NAME = 'i18n.ts';

/**
 * Raised when `circe.config.ts` is missing from the project root.
 *
 * @public
 */
export class ConfigFileNotFoundError extends CirceError {}

/**
 * Raised when `circe.config.ts` does not export a valid configuration object produced by `defineCirceConfig(...)`.
 *
 * @public
 */
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
 * Dynamically imports the project configuration file with engine-aware error diagnostics.
 *
 * @remarks
 * Node.js runs TypeScript natively only from version 22.18 (or 22.6+ behind `--experimental-strip-types`).
 * On older runtimes, Node throws `ERR_UNKNOWN_FILE_EXTENSION`. This helper intercepts that error
 * and produces an actionable error message indicating the required runtime version.
 *
 * @param filePath - The absolute path to `circe.config.ts`.
 * @returns The imported module namespace.
 * @throws {@link ConfigFileInvalidError} When the runtime lacks native TypeScript loader support.
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
    if (
      (error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' ||
      (error as { name?: string }).name === 'ResolveMessage' ||
      /^Cannot find (package|module) /.test((error as { message?: string }).message ?? '')
    ) {
      throw new ConfigFileInvalidError(
        `${CONFIG_FILE_NAME} imports something that is not installed (${(error as Error).message}). Install the project dependencies and retry.`,
        { cause: error, metadata: { file: filePath } },
      );
    }
    throw error;
  }
}

/**
 * Loads `circe.config.ts` from `cwd` and asserts the existence of a default configuration export.
 *
 * @remarks
 * Shared across CLI commands and programmatic loaders to guarantee consistent error reporting.
 *
 * @param cwd - The project root directory.
 * @returns The resolved {@link CirceConfigFile} and its absolute file path.
 * @throws {@link ConfigFileNotFoundError} When `circe.config.ts` does not exist.
 * @throws {@link ConfigFileInvalidError} When the file lacks a valid default export.
 *
 * @public
 */
export async function loadConfigFile(
  cwd: string,
  // biome-ignore lint/suspicious/noExplicitAny: schema type is only known once loaded
): Promise<{ configFile: CirceConfigFile<any>; filePath: string }> {
  const filePath = path.join(cwd, CONFIG_FILE_NAME);

  if (!existsSync(filePath)) {
    throw new ConfigFileNotFoundError(`${CONFIG_FILE_NAME} not found in ${cwd}`, {
      metadata: { file: filePath },
    });
  }

  const imported = (await importConfigFile(filePath)) as {
    // biome-ignore lint/suspicious/noExplicitAny: schema type is only known once loaded
    default?: CirceConfigFile<any>;
  };

  if (imported.default === undefined) {
    throw new ConfigFileInvalidError(
      `${CONFIG_FILE_NAME} must have a default export produced by defineCirceConfig(...)`,
      { metadata: { file: filePath } },
    );
  }

  return { configFile: imported.default, filePath };
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

/**
 * Represents a fully configured and populated {@link CirceApp} instance ready for execution or inspection.
 *
 * @public
 */
export interface PreparedApp {
  /** The initialized Circe application with all discovered modules registered. */
  readonly app: CirceApp;
  /** The resolved absolute directory where modules were scanned. */
  readonly scanRoot: string;
  /** The active transport mode ('gateway', 'http', or 'hybrid'). */
  readonly transport: TransportMode;
  /** HTTP transport configuration options when configured. */
  readonly httpConfig: HttpTransportConfig | undefined;
}

/**
 * Options for {@link prepareApp}.
 *
 * @public
 */
export interface PrepareAppOptions {
  /**
   * Skip loading the environment schema and use empty credentials. For commands that only
   * inspect which modules exist; the returned app must not be started.
   *
   * @defaultValue `false`
   */
  readonly inspectOnly?: boolean;
}

/**
 * Bootstraps a Circe application by loading configuration and discovering filesystem modules.
 *
 * @remarks
 * Coordinates the full Inversion-of-Control (IoC) initialization lifecycle:
 * 1. Loads `circe.config.ts` and parses typed environment variables.
 * 2. Resolves integrations and health probes.
 * 3. Dynamically discovers optional top-level modules (`middleware.ts`, `error.ts`, `localization.ts`/`i18n.ts`).
 * 4. Discovers and registers interaction modules across commands, command groups, context menus, components, modals, and events.
 * 5. Returns the prepared application instance *without* connecting to Discord Gateway or starting HTTP listeners.
 *
 * @param cwd - Project root directory.
 * @param logger - The logger instance to attach to the application.
 * @param options - Set `inspectOnly` to discover modules without reading the environment schema.
 * @returns A promise resolving to the {@link PreparedApp} container.
 *
 * @throws {@link ConfigFileNotFoundError} When `circe.config.ts` is missing.
 * @throws {@link ConfigFileInvalidError} When configuration is malformed or missing required keys (such as `http.publicKey`).
 * @throws {@link ModuleValidationError} When any discovered module violates the framework contract.
 *
 * @public
 */
export async function prepareApp(
  cwd: string,
  logger: Logger,
  options: PrepareAppOptions = {},
): Promise<PreparedApp> {
  const { configFile, filePath: configFilePath } = await loadConfigFile(cwd);
  // Inspection (routes, manifest) only reads the module tree, so it must work in a CI job
  // that has no secrets; `circe build` and `start` still validate the environment.
  const config: CirceCredentials = options.inspectOnly
    ? { token: '', clientId: '' }
    : (configFile.config.load() as CirceCredentials);
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
  const localization =
    (await loadOptionalModule<LocalizationResolver>(path.join(scanRoot, LOCALIZATION_FILE_NAME))) ??
    (await loadOptionalModule<LocalizationResolver>(path.join(scanRoot, I18N_FILE_NAME)));

  const app = createCirce({
    config,
    intents: configFile.intents,
    ...(configFile.client !== undefined ? { client: configFile.client } : {}),
    ...(configFile.health !== undefined
      ? {
          health: {
            ...configFile.health,
            checks: {
              ...configFile.health.checks,
              ...resolved.healthChecks,
            },
          },
        }
      : {}),
    ...(configFile.onUnhandledRejection !== undefined
      ? { onUnhandledRejection: configFile.onUnhandledRejection }
      : {}),
    ...(configFile.shutdownTimeoutMs !== undefined
      ? { shutdownTimeoutMs: configFile.shutdownTimeoutMs }
      : {}),
    ...(configFile.onInteractionComplete !== undefined
      ? { onInteractionComplete: configFile.onInteractionComplete }
      : {}),
    logger,
    autoLogin: transport !== 'http',
    ...(middleware !== undefined ? { middleware } : {}),
    ...(localization !== undefined ? { localization } : {}),
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
