import type { ZodError } from "zod";
import { CirceError, type CirceErrorOptions } from "../errors/circe-error.js";

export interface ConfigIssue {
  path: string;
  message: string;
}

export interface ConfigErrorOptions extends Omit<CirceErrorOptions, "metadata"> {
  issues: ConfigIssue[];
}

/**
 * Raised when a bot's configuration fails schema validation. Always
 * operational — a bad `.env` is an expected failure mode, not a bug — and
 * carries every failing field at once rather than one-at-a-time.
 */
export class ConfigError extends CirceError {
  readonly issues: ConfigIssue[];

  constructor(message: string, options: ConfigErrorOptions) {
    // `issues` lives only in the typed `this.issues` field below, not duplicated
    // into generic `metadata` too — see the `toJSON` override for serialization.
    super(message, { ...options, operational: true });
    this.issues = options.issues;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), issues: this.issues };
  }
}

export function issuesFromZodError(error: ZodError): ConfigIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}
