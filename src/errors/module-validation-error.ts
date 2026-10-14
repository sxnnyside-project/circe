import { CirceError, type CirceErrorOptions } from './circe-error.js';

export interface ModuleValidationIssue {
  /** The file (relative to the scanned directory) the issue belongs to. */
  file: string;
  /** What's wrong with it — a missing field, an import failure, etc. */
  message: string;
}

export interface ModuleValidationErrorOptions extends Omit<CirceErrorOptions, 'metadata'> {
  /** The module category being scanned — `"commands"`, `"events"`, etc. */
  category: string;
  issues: ModuleValidationIssue[];
}

/**
 * Raised when one or more files discovered under a scanned directory don't
 * satisfy their category's module contract (see module-contracts.md) or
 * failed to import. Always carries every failing file at once — aggregated
 * across the whole directory, never just the first one found — so fixing
 * one issue doesn't just uncover the next one on the following run.
 */
export class ModuleValidationError extends CirceError {
  readonly category: string;
  readonly issues: ModuleValidationIssue[];

  constructor(message: string, options: ModuleValidationErrorOptions) {
    super(message, { ...options, operational: true, metadata: { category: options.category } });
    this.category = options.category;
    this.issues = options.issues;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), category: this.category, issues: this.issues };
  }
}
