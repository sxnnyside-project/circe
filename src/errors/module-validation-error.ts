import { CirceError, type CirceErrorOptions } from './circe-error.js';

/**
 * A validation issue describing an invalid or malformed discovered module file.
 * @public
 */
export interface ModuleValidationIssue {
  /** The file (relative to the scanned directory) the issue belongs to. */
  readonly file: string;
  /** What's wrong with it — a missing field, invalid export, or import failure. */
  readonly message: string;
}

/**
 * Options for instantiating a `ModuleValidationError`.
 * @public
 */
export interface ModuleValidationErrorOptions extends Omit<CirceErrorOptions, 'metadata'> {
  /** The module category being scanned — `"commands"`, `"events"`, etc. */
  readonly category: string;
  readonly issues: readonly ModuleValidationIssue[];
}

/**
 * Raised when one or more files discovered under a scanned directory don't
 * satisfy their category's module contract or failed to import. Always carries
 * every failing file at once.
 *
 * @remarks
 * Rather than failing on the first invalid file, module validation aggregates
 * all discovered issues across the entire directory to give developers a comprehensive
 * diagnostic report in a single pass.
 *
 * @example
 * ```ts
 * throw new ModuleValidationError('Discovered 2 invalid command modules', {
 *   category: 'commands',
 *   issues: [
 *     { file: 'src/commands/bad.ts', message: 'Missing export default command(...)' },
 *     { file: 'src/commands/syntax.ts', message: 'SyntaxError: Unexpected token' },
 *   ],
 * });
 * ```
 *
 * @see {@link CirceError}
 * @public
 */
export class ModuleValidationError extends CirceError {
  readonly category: string;
  readonly issues: readonly ModuleValidationIssue[];

  /**
   * Creates a new `ModuleValidationError` instance.
   *
   * @param message - Summary error message.
   * @param options - Category and list of validation issues found.
   */
  constructor(message: string, options: ModuleValidationErrorOptions) {
    super(message, { ...options, operational: true, metadata: { category: options.category } });
    this.category = options.category;
    this.issues = options.issues;
  }

  /**
   * Serializes the validation error, explicitly including the category and issue array.
   *
   * @returns Serialized object with `category` and `issues` fields.
   * @override
   * @public
   */
  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), category: this.category, issues: this.issues };
  }
}
