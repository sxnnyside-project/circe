import type { Logger } from "../../logging/logger.js";
import { discoverModules } from "../module-loader.js";
import { CommandError } from "./errors.js";
import type { CommandRegistry } from "./registry.js";
import type { CommandDefinition } from "./types.js";

export interface LoadCommandsOptions {
  registry: CommandRegistry;
  logger: Logger;
}

/**
 * Recursively discovers command modules under `directory` — category
 * subfolders included — imports each one, validates its default export,
 * and registers it. A malformed module is a hard error rather than a
 * skipped file: silently dropping a bad command file is worse than failing
 * loudly at startup.
 */
export async function loadCommands(directory: string | URL, options: LoadCommandsOptions): Promise<void> {
  const modules = await discoverModules(directory, (fileName, cause) => {
    throw new CommandError(`Failed to import command module "${fileName}"`, {
      cause,
      metadata: { reason: "import-failed", file: fileName },
    });
  });

  for (const { fileName, value } of modules) {
    if (!isCommandDefinition(value)) {
      throw new CommandError(`Command module "${fileName}" does not export a valid default command definition`, {
        metadata: { reason: "malformed", file: fileName },
      });
    }

    options.registry.register(value);
    options.logger.debug(`Loaded command "${value.builder.name}"`, { file: fileName });
  }
}

function isCommandDefinition(value: unknown): value is CommandDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CommandDefinition>;
  return (
    typeof candidate.execute === "function" &&
    typeof candidate.builder === "object" &&
    candidate.builder !== null &&
    typeof (candidate.builder as { name?: unknown }).name === "string"
  );
}
