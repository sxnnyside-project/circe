import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODULE_FILE_PATTERN = /\.(ts|js)$/;

export interface DiscoveredModule {
  /** Path relative to the scanned directory, e.g. `"moderation/ban.js"` for a nested file. */
  fileName: string;
  /** The module's default export, unvalidated — the caller decides what shape it must have. */
  value: unknown;
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

    if (entry.isFile() && MODULE_FILE_PATTERN.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Shared by `loadCommands` and `loadEvents`: recursively scans `directory`
 * for `.ts`/`.js` files (category subfolders included — bots organize
 * commands however they need to) and dynamically imports each one's default
 * export. This is the part of module discovery that's identical between
 * commands and events — validating the export's shape and registering it
 * stays in each caller, since that's the part that actually differs.
 */
export async function discoverModules(
  directory: string | URL,
  onImportError: (fileName: string, cause: unknown) => never,
): Promise<DiscoveredModule[]> {
  const directoryPath = directory instanceof URL ? fileURLToPath(directory) : directory;
  const filePaths = (await findModuleFiles(directoryPath)).sort();

  const modules: DiscoveredModule[] = [];

  for (const fullPath of filePaths) {
    const fileName = path.relative(directoryPath, fullPath);
    const moduleUrl = pathToFileURL(fullPath).href;

    let imported: unknown;
    try {
      imported = await import(moduleUrl);
    } catch (error) {
      onImportError(fileName, error);
    }

    modules.push({ fileName, value: (imported as { default?: unknown }).default });
  }

  return modules;
}
