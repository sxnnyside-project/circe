import { getCorrelationId } from '../logging/context.js';

/**
 * Options for instantiating a `CirceError`.
 *
 * @public
 */
export interface CirceErrorOptions {
  /**
   * The underlying value/error that caused this one, if any.
   *
   * @defaultValue `undefined`
   */
  cause?: unknown;

  /**
   * Whether this represents an expected, recoverable operational failure (bad input,
   * invalid config, a guard rejection) rather than an unhandled defect.
   *
   * @defaultValue `true`
   */
  operational?: boolean;

  /**
   * Structured, loggable context about the failure.
   *
   * @defaultValue `{}`
   */
  metadata?: Record<string, unknown>;

  /**
   * Correlation ID to attach. When omitted, the currently active
   * correlation ID (if any) is captured automatically from AsyncLocalStorage.
   *
   * @defaultValue `getCorrelationId()`
   */
  correlationId?: string;
}

/**
 * Helper to safely sanitize metadata for JSON serialization.
 * Converts BigInts to string and handles circular references.
 *
 * @internal
 * @param value - Value to sanitize.
 * @param seen - WeakSet tracking visited objects to prevent circular loops.
 * @returns Serialized and cycle-safe object or primitive.
 */
function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeValue(val, seen);
    }
    return result;
  }
  return value;
}

/**
 * Serializes an underlying error cause safely.
 *
 * @remarks
 * Guarantees:
 * 1. Cycle-safe: Uses a `WeakSet` to prevent stack overflow on circular error causes.
 * 2. AggregateError support: Recursively preserves child errors in `AggregateError.errors`.
 * 3. BigInt-safe: Never throws `TypeError` on Discord snowflake BigInt values.
 *
 * @internal
 * @param cause - Underlying error or value to serialize.
 * @param seen - WeakSet tracking visited objects.
 * @returns Serialized error representation.
 */
function serializeCause(cause: unknown, seen = new WeakSet<object>()): unknown {
  if (cause === null || typeof cause !== 'object') {
    return typeof cause === 'bigint' ? cause.toString() : cause;
  }

  if (seen.has(cause)) {
    return '[CircularCause]';
  }
  seen.add(cause);

  if (cause instanceof CirceError) {
    return cause.toJSON(seen);
  }

  if (cause instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };

    if ('errors' in cause && Array.isArray((cause as { errors: unknown[] }).errors)) {
      serialized.errors = (cause as { errors: unknown[] }).errors.map((err) =>
        serializeCause(err, seen),
      );
    }

    if (cause.cause !== undefined) {
      serialized.cause = serializeCause(cause.cause, seen);
    }

    return serialized;
  }

  return sanitizeValue(cause, seen);
}

/**
 * Base error type for all errors raised by Circe.
 *
 * @remarks
 * Provides consistent error reporting across all layers:
 * - Nested cause propagation with circular-reference protection.
 * - Operational vs unexpected classification (`operational: boolean`).
 * - Structured metadata with automatic BigInt coercion for Discord snowflakes.
 * - Automatic AsyncLocalStorage correlation context attachment.
 * - Cycle-safe and BigInt-safe `toJSON()` for structured logging and APM integration.
 *
 * @example
 * ```ts
 * throw new CirceError('Command execution failed', {
 *   cause: originalError,
 *   metadata: { commandName: 'ping', userId: '123456789n' },
 *   operational: true,
 * });
 * ```
 *
 * @public
 */
export class CirceError extends Error {
  readonly operational: boolean;
  readonly metadata: Record<string, unknown>;
  readonly correlationId: string | undefined;

  /**
   * Creates a new `CirceError` instance.
   *
   * @param message - Human-readable error description.
   * @param options - Error customization options (cause, metadata, operational, correlationId).
   */
  constructor(message: string, options: CirceErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.operational = options.operational ?? true;
    this.metadata = options.metadata ?? {};
    this.correlationId = options.correlationId ?? getCorrelationId();

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }

  /**
   * Serializes the error to a clean, log-safe object.
   *
   * @remarks
   * Defined explicitly because native `Error` properties (`message`, `stack`) are non-enumerable.
   * Safe against circular causes, BigInt fields, and deeply nested AggregateError trees.
   * Compatible with `JSON.stringify()` (which passes `key: string` as the first argument).
   *
   * @param seenOrKey - Optional WeakSet tracking circular references, or property key when invoked by `JSON.stringify`.
   * @param maybeSeen - Optional WeakSet when called with key and seen.
   * @returns Clean serialized plain object suitable for JSON logging or APM transport.
   * @public
   */
  toJSON(
    seenOrKey?: WeakSet<object> | string,
    maybeSeen?: WeakSet<object>,
  ): Record<string, unknown> {
    const seen =
      seenOrKey instanceof WeakSet
        ? seenOrKey
        : maybeSeen instanceof WeakSet
          ? maybeSeen
          : new WeakSet<object>();

    seen.add(this);

    return {
      name: this.name,
      message: this.message,
      operational: this.operational,
      metadata: sanitizeValue(this.metadata) as Record<string, unknown>,
      correlationId: this.correlationId,
      stack: this.stack,
      cause: serializeCause(this.cause, seen),
    };
  }
}
