import { CirceError, type CirceErrorOptions } from './circe-error.js';

/**
 * Options for instantiating a `DiscoveryConflictError`.
 *
 * @public
 */
export interface DiscoveryConflictErrorOptions extends Omit<CirceErrorOptions, 'metadata'> {
  /** The module category involved — `"commands"`, `"components"`, etc. */
  readonly category: string;
  /** What conflicted — missing identity or duplicate identifier. */
  readonly reason: 'missing-identity' | 'duplicate';
  /** The command name / component prefix involved, if available. */
  readonly identity?: string;
}

/**
 * Raised when two modules resolve to the same identity within a category
 * (duplicate command name, colliding component prefix), or a module
 * is missing the identity required for registration.
 *
 * @remarks
 * Always marked as operational (`operational: true`) because module conflicts
 * are user configuration/naming issues detected at discovery time before startup.
 *
 * @example
 * ```ts
 * throw new DiscoveryConflictError('Duplicate command name "ping"', {
 *   category: 'commands',
 *   reason: 'duplicate',
 *   identity: 'ping',
 * });
 * ```
 *
 * @see {@link CirceError}
 * @public
 */
export class DiscoveryConflictError extends CirceError {
  readonly category: string;
  readonly reason: DiscoveryConflictErrorOptions['reason'];
  readonly identity: string | undefined;

  /**
   * Creates a new `DiscoveryConflictError` instance.
   *
   * @param message - Human-readable conflict description.
   * @param options - Category, conflict reason, and conflicting identity.
   */
  constructor(message: string, options: DiscoveryConflictErrorOptions) {
    super(message, {
      ...options,
      operational: true,
      metadata: { category: options.category, reason: options.reason, identity: options.identity },
    });
    this.category = options.category;
    this.reason = options.reason;
    this.identity = options.identity;
  }
}
