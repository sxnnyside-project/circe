import { ModuleValidationError } from "../../errors/module-validation-error.js";
import type { Logger } from "../../logging/logger.js";
import { discoverModules } from "../module-loader.js";
import type { ModalRegistry } from "./registry.js";
import type { ModalDefinition } from "./types.js";

export interface LoadModalsOptions {
  registry: ModalRegistry;
  logger: Logger;
}

function validateModalShape(value: unknown): string[] {
  if (typeof value !== "object" || value === null) {
    return ["does not export a default modal definition object"];
  }

  const candidate = value as Partial<ModalDefinition>;
  const issues: string[] = [];

  if (typeof candidate.execute !== "function") {
    issues.push("missing `execute`");
  }
  if (typeof candidate.prefix !== "string") {
    issues.push("missing `prefix`");
  }

  return issues;
}

/**
 * Recursively discovers modal modules under `directory` — category
 * subfolders included — imports each one, validates its default export,
 * and registers it. Mirrors `loadComponents`/`loadCommands`/`loadEvents`:
 * every malformed or unimportable file is aggregated into one
 * `ModuleValidationError` rather than stopping at the first one.
 */
export async function loadModals(directory: string | URL, options: LoadModalsOptions): Promise<void> {
  const { modules, failures } = await discoverModules(directory);
  const issues = failures.map((failure) => ({
    file: failure.fileName,
    message: `Failed to import: ${failure.cause instanceof Error ? failure.cause.message : String(failure.cause)}`,
  }));

  const valid: { fileName: string; value: ModalDefinition }[] = [];
  for (const { fileName, value } of modules) {
    const shapeIssues = validateModalShape(value);
    if (shapeIssues.length > 0) {
      issues.push(...shapeIssues.map((message) => ({ file: fileName, message })));
    } else {
      valid.push({ fileName, value: value as ModalDefinition });
    }
  }

  if (issues.length > 0) {
    throw new ModuleValidationError(`${issues.length} modal module issue(s) found`, {
      category: "modals",
      issues,
    });
  }

  for (const { fileName, value } of valid) {
    options.registry.register(value);
    options.logger.debug(`Loaded modal handler "${value.prefix}"`, { file: fileName });
  }
}
