import { ModuleValidationError } from '../../errors/module-validation-error.js';
import type { Logger } from '../../logging/logger.js';
import { discoverModules } from '../module-loader.js';
import type { CommandRegistry } from './registry.js';
import type { CommandDefinition } from './types.js';

/**
 * Options accepted by {@link loadCommands}.
 *
 * @public
 */
export interface LoadCommandsOptions {
  /** Target registry where validated commands will be stored. */
  registry: CommandRegistry;
  /** Component logger for discovery and loading diagnostics. */
  logger: Logger;
}

function validateCommandShape(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return ['does not export a default command definition object'];
  }

  const candidate = value as Partial<CommandDefinition>;
  const issues: string[] = [];

  if (typeof candidate.execute !== 'function') {
    issues.push('missing `execute`');
  }
  if (typeof candidate.builder !== 'object' || candidate.builder === null) {
    issues.push('missing `builder`');
  } else if (typeof (candidate.builder as { name?: unknown }).name !== 'string') {
    issues.push('`builder` is missing a `name`');
  }

  return issues;
}

/**
 * Recursively scans, imports, validates, and registers slash command modules from disk.
 *
 * @remarks
 * Gathers all malformed shapes and unimportable modules into a single {@link ModuleValidationError}
 * so all syntax and structure errors across the entire directory are reported together.
 *
 * @param directory - Directory path or `file://` URL containing command files.
 * @param options - Registry target and logger.
 * @throws {@link ModuleValidationError} If any scanned module fails shape validation or throws during import.
 *
 * @public
 */
export async function loadCommands(
  directory: string | URL,
  options: LoadCommandsOptions,
): Promise<void> {
  const { modules, failures } = await discoverModules(directory);
  const issues = failures.map((failure) => ({
    file: failure.fileName,
    message: `Failed to import: ${failure.cause instanceof Error ? failure.cause.message : String(failure.cause)}`,
  }));

  const valid: { fileName: string; value: CommandDefinition }[] = [];
  for (const { fileName, value } of modules) {
    const shapeIssues = validateCommandShape(value);
    if (shapeIssues.length > 0) {
      issues.push(...shapeIssues.map((message) => ({ file: fileName, message })));
    } else {
      valid.push({ fileName, value: value as CommandDefinition });
    }
  }

  if (issues.length > 0) {
    throw new ModuleValidationError(`${issues.length} command module issue(s) found`, {
      category: 'commands',
      issues,
    });
  }

  for (const { fileName, value } of valid) {
    options.registry.register(value);
    options.logger.debug(`Loaded command "${value.builder.name}"`, { file: fileName });
  }
}
