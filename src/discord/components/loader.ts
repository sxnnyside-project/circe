import { ModuleValidationError } from '../../errors/module-validation-error.js';
import type { Logger } from '../../logging/logger.js';
import { discoverModules } from '../module-loader.js';
import type { ComponentRegistry } from './registry.js';
import type { ComponentDefinition } from './types.js';

export interface LoadComponentsOptions {
  registry: ComponentRegistry;
  logger: Logger;
}

function validateComponentShape(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return ['does not export a default component definition object'];
  }

  const candidate = value as Partial<ComponentDefinition>;
  const issues: string[] = [];

  if (typeof candidate.execute !== 'function') {
    issues.push('missing `execute`');
  }
  if (typeof candidate.prefix !== 'string') {
    issues.push('missing `prefix`');
  }

  return issues;
}

/**
 * Recursively discovers component modules under `directory` — category
 * subfolders included — imports each one, validates its default export,
 * and registers it. Mirrors `loadCommands`/`loadEvents`: every malformed
 * or unimportable file is aggregated into one `ModuleValidationError`
 * rather than stopping at the first one.
 */
export async function loadComponents(
  directory: string | URL,
  options: LoadComponentsOptions,
): Promise<void> {
  const { modules, failures } = await discoverModules(directory);
  const issues = failures.map((failure) => ({
    file: failure.fileName,
    message: `Failed to import: ${failure.cause instanceof Error ? failure.cause.message : String(failure.cause)}`,
  }));

  const valid: { fileName: string; value: ComponentDefinition }[] = [];
  for (const { fileName, value } of modules) {
    const shapeIssues = validateComponentShape(value);
    if (shapeIssues.length > 0) {
      issues.push(...shapeIssues.map((message) => ({ file: fileName, message })));
    } else {
      valid.push({ fileName, value: value as ComponentDefinition });
    }
  }

  if (issues.length > 0) {
    throw new ModuleValidationError(`${issues.length} component module issue(s) found`, {
      category: 'components',
      issues,
    });
  }

  for (const { fileName, value } of valid) {
    options.registry.register(value);
    options.logger.debug(`Loaded component handler "${value.prefix}"`, { file: fileName });
  }
}
