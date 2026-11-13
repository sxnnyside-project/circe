import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MODULE_FILE_PATTERN = /\.(ts|js|mjs|cjs)$/;
const DECLARATION_FILE_PATTERN = /\.d\.(ts|mts|cts)$/;

/**
 * An imported file from a scanned filesystem category directory.
 *
 * @internal
 */
export interface DiscoveredModule {
  /** Path relative to the scanned directory, e.g. `"moderation/ban.js"` for a nested file. */
  fileName: string;
  /** The module's default export, unvalidated — the caller asserts the expected interface. */
  value: unknown;
}

/**
 * Details of an unhandled exception thrown during dynamic module importation.
 *
 * @internal
 */
export interface DiscoveryFailure {
  /** Path relative to the scanned directory. */
  fileName: string;
  /** The error thrown by the dynamic import. */
  cause: unknown;
}

/**
 * Aggregated result of recursive filesystem discovery.
 *
 * @internal
 */
export interface DiscoverModulesResult {
  /** Successfully imported modules. */
  modules: DiscoveredModule[];
  /** Modules that threw during dynamic import. */
  failures: DiscoveryFailure[];
}

async function findModuleFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findModuleFiles(fullPath)));
      continue;
    }

    if (
      entry.isFile() &&
      MODULE_FILE_PATTERN.test(entry.name) &&
      !DECLARATION_FILE_PATTERN.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Recursively scans `directory` for `.ts`/`.js`/`.mjs`/`.cjs` files and dynamically imports each default export.
 *
 * @remarks
 * Subfolders are recursively included, permitting arbitrary nested directory structures.
 * Import failures are aggregated into `failures` rather than thrown immediately, enabling
 * composite validation error reporting via {@link ModuleValidationError}.
 *
 * @param directory - Absolute path string or `file://` URL of the target directory.
 * @returns An object containing discovered modules and recorded import failures.
 *
 * @internal
 */
export async function discoverModules(directory: string | URL): Promise<DiscoverModulesResult> {
  const directoryPath = directory instanceof URL ? fileURLToPath(directory) : directory;
  const filePaths = (await findModuleFiles(directoryPath)).sort();

  const modules: DiscoveredModule[] = [];
  const failures: DiscoveryFailure[] = [];

  for (const fullPath of filePaths) {
    const fileName = path.relative(directoryPath, fullPath);
    const moduleUrl = pathToFileURL(fullPath).href;

    try {
      const imported = (await import(moduleUrl)) as { default?: unknown };
      modules.push({ fileName, value: imported.default });
    } catch (error) {
      failures.push({ fileName, cause: error });
    }
  }

  return { modules, failures };
}
