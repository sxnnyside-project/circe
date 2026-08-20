import type { Logger } from "../../logging/logger.js";
import { discoverModules } from "../module-loader.js";
import { ComponentError } from "./errors.js";
import type { ComponentRegistry } from "./registry.js";
import type { ComponentDefinition } from "./types.js";

export interface LoadComponentsOptions {
  registry: ComponentRegistry;
  logger: Logger;
}

/**
 * Recursively discovers component modules under `directory` — category
 * subfolders included — imports each one, validates its default export,
 * and registers it. Mirrors `loadCommands`/`loadEvents`: a malformed
 * module fails loudly rather than being silently skipped.
 */
export async function loadComponents(directory: string | URL, options: LoadComponentsOptions): Promise<void> {
  const modules = await discoverModules(directory, (fileName, cause) => {
    throw new ComponentError(`Failed to import component module "${fileName}"`, {
      cause,
      metadata: { reason: "import-failed", file: fileName },
    });
  });

  for (const { fileName, value } of modules) {
    if (!isComponentDefinition(value)) {
      throw new ComponentError(`Component module "${fileName}" does not export a valid default component definition`, {
        metadata: { reason: "malformed", file: fileName },
      });
    }

    options.registry.register(value);
    options.logger.debug(`Loaded component handler "${value.prefix}"`, { file: fileName });
  }
}

function isComponentDefinition(value: unknown): value is ComponentDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ComponentDefinition>;
  return typeof candidate.execute === "function" && typeof candidate.prefix === "string";
}
