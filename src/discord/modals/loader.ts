import type { Logger } from "../../logging/logger.js";
import { discoverModules } from "../module-loader.js";
import { ModalError } from "./errors.js";
import type { ModalRegistry } from "./registry.js";
import type { ModalDefinition } from "./types.js";

export interface LoadModalsOptions {
  registry: ModalRegistry;
  logger: Logger;
}

/**
 * Recursively discovers modal modules under `directory` — category
 * subfolders included — imports each one, validates its default export,
 * and registers it. Mirrors `loadComponents`/`loadCommands`/`loadEvents`: a
 * malformed module fails loudly rather than being silently skipped.
 */
export async function loadModals(directory: string | URL, options: LoadModalsOptions): Promise<void> {
  const modules = await discoverModules(directory, (fileName, cause) => {
    throw new ModalError(`Failed to import modal module "${fileName}"`, {
      cause,
      metadata: { reason: "import-failed", file: fileName },
    });
  });

  for (const { fileName, value } of modules) {
    if (!isModalDefinition(value)) {
      throw new ModalError(`Modal module "${fileName}" does not export a valid default modal definition`, {
        metadata: { reason: "malformed", file: fileName },
      });
    }

    options.registry.register(value);
    options.logger.debug(`Loaded modal handler "${value.prefix}"`, { file: fileName });
  }
}

function isModalDefinition(value: unknown): value is ModalDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ModalDefinition>;
  return typeof candidate.execute === "function" && typeof candidate.prefix === "string";
}
