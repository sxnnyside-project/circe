import type { ZodError } from 'zod';
import { CirceError, type CirceErrorOptions } from '../errors/circe-error.js';

/**
 * A single configuration schema validation issue.
 * @public
 */
export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Options for instantiating a `ConfigError`.
 * @public
 */
export interface ConfigErrorOptions extends Omit<CirceErrorOptions, 'metadata'> {
  readonly issues: readonly ConfigIssue[];
}

/**
 * Raised when a bot's configuration fails schema validation. Always operational
 * (a bad `.env` is an expected configuration failure mode, not an unhandled crash)
 * and carries every failing field at once rather than one-at-a-time.
 *
 * @remarks
 * Contains an `issues` array detailing every failed path and description, allowing
 * bot developers to fix multiple missing or invalid environment variables in one restart.
 *
 * @example
 * ```ts
 * throw new ConfigError('Invalid configuration: 2 issue(s) found', {
 *   issues: [
 *     { path: 'DISCORD_TOKEN', message: 'Required' },
 *     { path: 'PORT', message: 'Expected number, received string' },
 *   ],
 * });
 * ```
 *
 * @see {@link CirceError}
 * @public
 */
export class ConfigError extends CirceError {
  readonly issues: readonly ConfigIssue[];

  /**
   * Creates a new `ConfigError` instance.
   *
   * @param message - Summary error message.
   * @param options - Options containing the list of configuration issues.
   */
  constructor(message: string, options: ConfigErrorOptions) {
    super(message, { ...options, operational: true });
    this.name = 'ConfigError';
    this.issues = options.issues;
  }

  /**
   * Serializes the configuration error, explicitly appending the `issues` array.
   *
   * @returns Serialized object with `issues` included.
   * @override
   * @public
   */
  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), issues: this.issues };
  }
}

/**
 * Extracts normalized `ConfigIssue` items from a Zod or schema validation error.
 *
 * @remarks
 * Handles standard Zod error objects as well as custom error objects that expose
 * an `issues` array with `path` and `message` properties.
 *
 * @param error - Caught error or issue container.
 * @returns Array of normalized `ConfigIssue` objects.
 * @public
 */
export function issuesFromZodError(
  error:
    | ZodError
    | {
        readonly issues?: readonly {
          readonly path?: readonly (string | number)[];
          readonly message: string;
        }[];
      },
): ConfigIssue[] {
  const issues = (
    error as {
      readonly issues?: readonly {
        readonly path?: readonly (string | number)[];
        readonly message: string;
      }[];
    }
  ).issues;
  if (!issues || !Array.isArray(issues)) {
    return [{ path: '(root)', message: error instanceof Error ? error.message : String(error) }];
  }
  return issues.map((issue) => ({
    path: issue.path && issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}
