import { ModuleValidationError } from "../../errors/module-validation-error.js";
import type { Logger } from "../../logging/logger.js";
import { discoverModules } from "../module-loader.js";
import type { EventRegistry } from "./registry.js";
import type { EventDefinition } from "./types.js";

export interface LoadEventsOptions {
  registry: EventRegistry;
  logger: Logger;
}

function validateEventShape(value: unknown): string[] {
  if (typeof value !== "object" || value === null) {
    return ["does not export a default event definition object"];
  }

  const candidate = value as Partial<EventDefinition>;
  const issues: string[] = [];

  if (typeof candidate.execute !== "function") {
    issues.push("missing `execute`");
  }
  if (typeof candidate.name !== "string") {
    issues.push("missing `name`");
  }

  return issues;
}

/**
 * Recursively discovers event modules under `directory`, imports each one,
 * validates its default export, and registers it. Mirrors `loadCommands` —
 * every malformed or unimportable file is aggregated into one
 * `ModuleValidationError` rather than stopping at the first one.
 */
export async function loadEvents(directory: string | URL, options: LoadEventsOptions): Promise<void> {
  const { modules, failures } = await discoverModules(directory);
  const issues = failures.map((failure) => ({
    file: failure.fileName,
    message: `Failed to import: ${failure.cause instanceof Error ? failure.cause.message : String(failure.cause)}`,
  }));

  const valid: { fileName: string; value: EventDefinition }[] = [];
  for (const { fileName, value } of modules) {
    const shapeIssues = validateEventShape(value);
    if (shapeIssues.length > 0) {
      issues.push(...shapeIssues.map((message) => ({ file: fileName, message })));
    } else {
      valid.push({ fileName, value: value as EventDefinition });
    }
  }

  if (issues.length > 0) {
    throw new ModuleValidationError(`${issues.length} event module issue(s) found`, {
      category: "events",
      issues,
    });
  }

  for (const { fileName, value } of valid) {
    options.registry.register(value);
    options.logger.debug(`Loaded event "${String(value.name)}"`, { file: fileName, once: value.once ?? false });
  }
}
