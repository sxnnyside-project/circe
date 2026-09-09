import { ConfigError } from "../config/errors.js";
import type { CirceError } from "../errors/circe-error.js";
import { DiscoveryConflictError } from "../errors/discovery-conflict-error.js";
import { ModuleValidationError } from "../errors/module-validation-error.js";

/** Renders a `CirceError` in the `✗ <location> / <reason>` format shared across authoring-time failures — see error-taxonomy.md. */
export function renderError(error: CirceError): string {
  if (error instanceof ModuleValidationError) {
    const blocks = error.issues.map((issue) => `✗ ${issue.file}\n  ${issue.message}`);
    return [...blocks, `${error.issues.length} error(s) found.`].join("\n\n");
  }

  const file = typeof error.metadata.file === "string" ? error.metadata.file : undefined;
  const lines = [`✗ ${file ?? error.name}`, `  ${error.message}`];

  if (error instanceof ConfigError) {
    for (const issue of error.issues) {
      lines.push(`  ${issue.path}: ${issue.message}`);
    }
  }

  if (error instanceof DiscoveryConflictError && error.identity !== undefined) {
    lines.push(`  identity: ${error.identity}`);
  }

  return lines.join("\n");
}

/** `1` for an expected, actionable failure; `2` for an unexpected internal one — see error-taxonomy.md. */
export function exitCodeFor(error: CirceError): 1 | 2 {
  return error.operational ? 1 : 2;
}
