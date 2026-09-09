import { CirceError, type CirceErrorOptions } from "./circe-error.js";

export interface DiscoveryConflictErrorOptions extends Omit<CirceErrorOptions, "metadata"> {
  /** The module category involved — `"commands"`, `"components"`, etc. */
  category: string;
  /** What conflicted — the reason a registration was rejected: a missing identity, or which identity was duplicated. */
  reason: "missing-identity" | "duplicate";
  /** The command name / component prefix / etc. involved, when there is one to name. */
  identity?: string;
}

/**
 * Raised when two modules resolve to the same identity within a category
 * (duplicate command name, colliding component prefix, ...), or a module
 * is missing the identity it needs to be registered at all.
 */
export class DiscoveryConflictError extends CirceError {
  readonly category: string;
  readonly reason: DiscoveryConflictErrorOptions["reason"];
  readonly identity: string | undefined;

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
