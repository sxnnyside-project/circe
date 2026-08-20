import { getCorrelationId } from "../logging/context.js";

export interface CirceErrorOptions {
  /** The underlying value/error that caused this one, if any. */
  cause?: unknown;
  /**
   * Whether this represents an expected, recoverable failure (bad input,
   * invalid config, a guard rejection) rather than a bug. Defaults to `true`
   * — callers that know they're wrapping a genuine bug should pass `false`.
   */
  operational?: boolean;
  /** Structured, loggable context about the failure. */
  metadata?: Record<string, unknown>;
  /**
   * Correlation ID to attach. When omitted, the currently active
   * correlation ID (if any) is captured automatically.
   */
  correlationId?: string;
}

/**
 * Base error type for all errors raised by Circe. Framework modules
 * (config, lifecycle, etc.) extend this rather than throwing plain `Error`s
 * so callers can rely on a consistent shape: cause, operational/unexpected
 * classification, structured metadata, and correlation context.
 */
export class CirceError extends Error {
  readonly operational: boolean;
  readonly metadata: Record<string, unknown>;
  readonly correlationId: string | undefined;

  constructor(message: string, options: CirceErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.operational = options.operational ?? true;
    this.metadata = options.metadata ?? {};
    this.correlationId = options.correlationId ?? getCorrelationId();

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }

  /**
   * `Error.prototype.message`/`stack` are non-enumerable, so
   * `JSON.stringify(error)` silently produces `{}` unless an error defines
   * its own `toJSON`. Every structured log line in Circe eventually
   * stringifies whatever it's given — without this, the one piece of
   * information a log line most needs would be the one thing missing from it.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      operational: this.operational,
      metadata: this.metadata,
      correlationId: this.correlationId,
      stack: this.stack,
      cause: serializeCause(this.cause),
    };
  }
}

function serializeCause(cause: unknown): unknown {
  if (cause instanceof CirceError) {
    return cause.toJSON();
  }
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
}
