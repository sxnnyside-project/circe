import { ConfigError } from '../config/errors.js';
import type { CirceError } from './circe-error.js';
import { DiscoveryConflictError } from './discovery-conflict-error.js';
import { ModuleValidationError } from './module-validation-error.js';

/**
 * Formats a {@link CirceError} into a human-readable diagnosis block for stderr.
 *
 * @remarks
 * Produces the standard Circe error block format:
 * ```text
 * ✗ <file or error-name>
 *   <message>
 *   <issue-path>: <issue-message>
 * ```
 * Handles composite validation errors (such as {@link ModuleValidationError}
 * and {@link ConfigError}) by unrolling multiple underlying issues.
 *
 * @param error - The operational or unhandled {@link CirceError} to render.
 * @returns A formatted multiline string suitable for writing to `process.stderr`.
 *
 * @example
 * ```typescript
 * import { renderError } from './render-error.js';
 * process.stderr.write(`${renderError(err)}\n`);
 * ```
 *
 * @public
 */
export function renderError(error: CirceError): string {
  if (error instanceof ModuleValidationError) {
    const blocks = error.issues.map((issue) => `✗ ${issue.file}\n  ${issue.message}`);
    return [...blocks, `${error.issues.length} error(s) found.`].join('\n\n');
  }

  const file = typeof error.metadata.file === 'string' ? error.metadata.file : undefined;
  const lines = [`✗ ${file ?? error.name}`, `  ${error.message}`];

  if (error instanceof ConfigError) {
    for (const issue of error.issues) {
      lines.push(`  ${issue.path}: ${issue.message}`);
    }
  }

  if (error instanceof DiscoveryConflictError && error.identity !== undefined) {
    lines.push(`  identity: ${error.identity}`);
  }

  return lines.join('\n');
}

/**
 * Stable failure domain reported in structured (`--format json`) diagnostics.
 *
 * @remarks
 * Agents and CI pipelines branch on `category` rather than on the human-readable message:
 * - `config`: `circe.config.ts` environment schema validation failed ({@link ConfigError}).
 * - `config-file`: `circe.config.ts` is missing, unloadable, or lacks a valid default export.
 * - `module-validation`: One or more discovered modules violate their category contract.
 * - `discovery-conflict`: Two modules resolve to the same identity (name, prefix).
 * - `usage`: Invalid CLI invocation (unknown command, missing argument, bad flag value).
 * - `operational`: Any other expected failure (`operational: true`).
 * - `internal`: Unexpected defect (`operational: false`).
 *
 * @public
 */
export type ErrorCategory =
  | 'config'
  | 'config-file'
  | 'module-validation'
  | 'discovery-conflict'
  | 'usage'
  | 'operational'
  | 'internal';

/**
 * A single actionable problem inside a {@link StructuredError}.
 *
 * @remarks
 * Module-validation issues carry `file`; configuration issues carry `path`.
 *
 * @public
 */
export interface StructuredErrorIssue {
  /** Offending file, relative to the scanned category folder. */
  readonly file?: string;
  /** Dotted configuration key path (`'token'`, `'http.publicKey'`). */
  readonly path?: string;
  /** Human-readable explanation of the problem. */
  readonly message: string;
}

/**
 * Machine-readable projection of a {@link CirceError}.
 *
 * @public
 */
export interface StructuredError {
  /** Error class name (`'ModuleValidationError'`, `'ConfigError'`, ...). */
  readonly name: string;
  /** Failure domain; see {@link ErrorCategory}. */
  readonly category: ErrorCategory;
  /** Primary diagnostic message. */
  readonly message: string;
  /** `true` for expected failures the user can fix; `false` for internal defects. */
  readonly operational: boolean;
  /** Process exit code the CLI sets for this failure (`1` operational, `2` internal or usage). */
  readonly exitCode: 1 | 2;
  /** Every aggregated problem; empty when the error carries a single message only. */
  readonly issues: readonly StructuredErrorIssue[];
  /** File the error is attributed to, when known. */
  readonly file?: string;
  /** Conflicting identity (command name, component prefix) for discovery conflicts. */
  readonly identity?: string;
  /** Suggested correction, such as a "did you mean" candidate. */
  readonly suggestion?: string;
  /** Correlation ID captured when the error was raised, if any. */
  readonly correlationId?: string;
  /** BigInt-safe, cycle-safe structured context. */
  readonly metadata: Record<string, unknown>;
  /** Stack trace; present only for non-operational errors. */
  readonly stack?: string;
}

/**
 * Envelope written to stdout when a command fails under `--format json`.
 *
 * @public
 */
export interface StructuredErrorReport {
  /** Always `false`; successful payloads never use this envelope. */
  readonly ok: false;
  /** The structured failure description. */
  readonly error: StructuredError;
}

function categoryOf(error: CirceError): ErrorCategory {
  if (error instanceof ModuleValidationError) return 'module-validation';
  if (error instanceof DiscoveryConflictError) return 'discovery-conflict';
  if (error instanceof ConfigError) return 'config';
  if (error.name.startsWith('ConfigFile')) return 'config-file';
  return error.operational ? 'operational' : 'internal';
}

/**
 * Projects a {@link CirceError} into its machine-readable {@link StructuredErrorReport}.
 *
 * @remarks
 * Mirrors the information {@link renderError} prints for humans, without parsing text:
 * composite errors ({@link ModuleValidationError}, {@link ConfigError}) are unrolled into
 * `issues`, discovery conflicts expose `identity`, and metadata is serialized through
 * {@link CirceError.toJSON} so Discord snowflake BigInts and circular values never throw.
 * Stack traces are included only for non-operational errors, keeping expected failures compact.
 *
 * @param error - The error to project.
 * @returns A report whose `ok` is always `false`.
 *
 * @example
 * ```typescript
 * const report = toStructuredError(error);
 * if (report.error.category === 'module-validation') {
 *   for (const issue of report.error.issues) console.log(issue.file, issue.message);
 * }
 * ```
 *
 * @public
 */
export function toStructuredError(error: CirceError): StructuredErrorReport {
  const issues: StructuredErrorIssue[] =
    error instanceof ModuleValidationError
      ? error.issues.map((issue) => ({ file: issue.file, message: issue.message }))
      : error instanceof ConfigError
        ? error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
        : [];

  const file = typeof error.metadata.file === 'string' ? error.metadata.file : undefined;
  const metadata = error.toJSON().metadata as Record<string, unknown>;

  return {
    ok: false,
    error: {
      name: error.name,
      category: categoryOf(error),
      message: error.message,
      operational: error.operational,
      exitCode: exitCodeFor(error),
      issues,
      ...(file !== undefined ? { file } : {}),
      ...(error instanceof DiscoveryConflictError && error.identity !== undefined
        ? { identity: error.identity }
        : {}),
      ...(error.correlationId !== undefined ? { correlationId: error.correlationId } : {}),
      metadata,
      ...(!error.operational && error.stack !== undefined ? { stack: error.stack } : {}),
    },
  };
}

/**
 * Serializes a {@link CirceError} as the pretty-printed JSON string agents consume.
 *
 * @param error - The error to serialize.
 * @returns Indented JSON for {@link StructuredErrorReport}, without a trailing newline.
 *
 * @example
 * ```typescript
 * process.stdout.write(`${renderErrorJson(error)}\n`);
 * ```
 *
 * @public
 */
export function renderErrorJson(error: CirceError): string {
  return JSON.stringify(toStructuredError(error), null, 2);
}

/**
 * Serializes an invalid CLI invocation as a {@link StructuredErrorReport}.
 *
 * @remarks
 * Usage errors are not {@link CirceError} instances: they carry `category: 'usage'`,
 * `operational: true`, and exit code `2`, matching the plain-text usage error contract.
 *
 * @param message - What was wrong with the invocation.
 * @param suggestion - Optional corrected value (a "did you mean" candidate).
 * @returns Indented JSON for the report, without a trailing newline.
 *
 * @public
 */
export function renderUsageErrorJson(message: string, suggestion?: string): string {
  const report: StructuredErrorReport = {
    ok: false,
    error: {
      name: 'UsageError',
      category: 'usage',
      message,
      operational: true,
      exitCode: 2,
      issues: [],
      ...(suggestion !== undefined ? { suggestion } : {}),
      metadata: {},
    },
  };
  return JSON.stringify(report, null, 2);
}

/**
 * Determines the standard process exit code for a given {@link CirceError}.
 *
 * @remarks
 * Follows the Sxnnyside CLI error taxonomy:
 * - Code `1`: Operational failure (expected user/configuration errors, validation issues).
 * - Code `2`: Non-operational failure (internal bugs, assertion failures, system panics).
 *
 * @param error - The error to inspect.
 * @returns Exit code `1` for operational errors, `2` for non-operational errors.
 *
 * @example
 * ```typescript
 * process.exitCode = exitCodeFor(error);
 * ```
 *
 * @public
 */
export function exitCodeFor(error: CirceError): 1 | 2 {
  return error.operational ? 1 : 2;
}
