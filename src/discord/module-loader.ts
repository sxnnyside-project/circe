import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODULE_FILE_PATTERN = /\.(ts|js|mjs|cjs)$/;
const DECLARATION_FILE_PATTERN = /\.d\.(ts|mts|cts)$/;

export interface DiscoveredModule {
  /** Path relative to the scanned directory, e.g. `"moderation/ban.js"` for a nested file. */
  fileName: string;
  /** The module's default export, unvalidated — the caller decides what shape it must have. */
  value: unknown;
}

export interface DiscoveryFailure {
  fileName: string;
  cause: unknown;
}

export interface DiscoverModulesResult {
  modules: DiscoveredModule[];
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

    if (entry.isFile() && MODULE_FILE_PATTERN.test(entry.name) && !DECLARATION_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Shared by every category loader: recursively scans `directory` for
 * `.ts`/`.js`/`.mjs`/`.cjs` files (category subfolders included — bots
 * organize commands however they need to) and dynamically imports each
 * one's default export. Import failures are collected in `failures`
 * rather than thrown immediately — the caller aggregates them alongside
 * shape-validation failures into one `ModuleValidationError` covering the
 * whole directory, per error-taxonomy.md's aggregation rule, instead of
 * stopping at the first bad file.
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
