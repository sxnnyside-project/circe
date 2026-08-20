import type { Logger } from "../../logging/logger.js";
import { discoverModules } from "../module-loader.js";
import { EventError } from "./errors.js";
import type { EventRegistry } from "./registry.js";
import type { EventDefinition } from "./types.js";

export interface LoadEventsOptions {
  registry: EventRegistry;
  logger: Logger;
}

/**
 * Recursively discovers event modules under `directory`, imports each one,
 * validates its default export, and registers it. Mirrors `loadCommands` —
 * a malformed module fails loudly rather than being silently skipped.
 */
export async function loadEvents(directory: string | URL, options: LoadEventsOptions): Promise<void> {
  const modules = await discoverModules(directory, (fileName, cause) => {
    throw new EventError(`Failed to import event module "${fileName}"`, {
      cause,
      metadata: { reason: "import-failed", file: fileName },
    });
  });

  for (const { fileName, value } of modules) {
    if (!isEventDefinition(value)) {
      throw new EventError(`Event module "${fileName}" does not export a valid default event definition`, {
        metadata: { reason: "malformed", file: fileName },
      });
    }

    options.registry.register(value);
    options.logger.debug(`Loaded event "${String(value.name)}"`, { file: fileName, once: value.once ?? false });
  }
}

function isEventDefinition(value: unknown): value is EventDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<EventDefinition>;
  return typeof candidate.execute === "function" && typeof candidate.name === "string";
}
