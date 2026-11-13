import { getCorrelationId } from './context.js';

/**
 * Standard log severity levels.
 *
 * @public
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Execution environments controlling formatting and defaults.
 *
 * @public
 */
export type LogEnvironment = 'development' | 'staging' | 'production';

/**
 * Structured key-value metadata attached to a log entry.
 *
 * @public
 */
export type LogMetadata = Record<string, unknown>;

/**
 * Fully resolved log entry passed to a `LogSink`.
 *
 * @public
 */
export interface LogEntry {
  /** Log severity level. */
  level: LogLevel;
  /** Human-readable log message. */
  message: string;
  /** ISO-8601 timestamp string when the log entry was produced. */
  timestamp: string;
  /** Structured contextual metadata dictionary. */
  metadata: LogMetadata;
  /** Correlation ID captured automatically from AsyncLocalStorage, if present. */
  correlationId: string | undefined;
}

/**
 * Sink function that receives formatted log entries.
 *
 * @param entry - Resolved log entry object.
 * @public
 */
export type LogSink = (entry: LogEntry) => void;

/**
 * Configuration options for creating a `Logger`.
 *
 * @public
 */
export interface LoggerOptions {
  /**
   * Minimum severity level written.
   *
   * @defaultValue `"debug"` in development, `"info"` in production/staging.
   */
  level?: LogLevel;

  /**
   * Controls output formatting: pretty human-readable text in development, structured JSON otherwise.
   *
   * @defaultValue `"development"`
   */
  environment?: LogEnvironment;

  /**
   * Base metadata merged into every entry (e.g. a component/module name).
   *
   * @defaultValue `{}`
   */
  metadata?: LogMetadata;

  /**
   * Where entries are written. Defaults to stdout (JSON) or formatted lines on stderr/stdout.
   * Overriding this is how applications route logs to custom transports (Valkey, Datadog, Pino).
   *
   * @defaultValue Standard stream writer (stdout/stderr).
   */
  sink?: LogSink;
}

/**
 * Structured logger interface used across Circe and consuming applications.
 *
 * @public
 */
export interface Logger {
  /**
   * Logs a message at `'debug'` level.
   *
   * @param message - Diagnostic message.
   * @param metadata - Optional key-value context.
   */
  debug(message: string, metadata?: LogMetadata): void;

  /**
   * Logs a message at `'info'` level.
   *
   * @param message - Operational message.
   * @param metadata - Optional key-value context.
   */
  info(message: string, metadata?: LogMetadata): void;

  /**
   * Logs a message at `'warn'` level.
   *
   * @param message - Warning message.
   * @param metadata - Optional key-value context.
   */
  warn(message: string, metadata?: LogMetadata): void;

  /**
   * Logs a message at `'error'` level.
   *
   * @param message - Error message.
   * @param metadata - Optional key-value context.
   */
  error(message: string, metadata?: LogMetadata): void;

  /**
   * Returns a new child logger that merges `metadata` into every entry it writes.
   *
   * @param metadata - Additional metadata to inherit in the child logger.
   * @returns Child logger instance.
   */
  child(metadata: LogMetadata): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** An `Error` has no enumerable own properties, so `JSON.stringify` would print it as `{}`. */
function errorToJson(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause !== undefined ? { cause: error.cause } : {}),
  };
}

/**
 * Serializes values safely for structured logs.
 *
 * Design guarantees:
 * 1. Fast-path handles BigInts (Discord Snowflakes) and Errors directly without throwing exceptions.
 * 2. Slow-path catches circular references and annotates them with '[Circular]'.
 * 3. Ultimate fallback guarantees the logger NEVER throws, even with throwing getters or broken Proxies.
 */
function safeStringify(value: unknown): string {
  // Fast path: Handles BigInts (crucial for Discord Snowflakes) and Errors in 1 pass without throwing
  try {
    return JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v === 'bigint') {
        return v.toString();
      }
      if (v instanceof Error) {
        return errorToJson(v);
      }
      return v;
    });
  } catch {
    // Slow path: handles circular references
    try {
      const seen = new WeakSet();
      return JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v === 'bigint') {
          return v.toString();
        }
        if (v instanceof Error) {
          return errorToJson(v);
        }
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) {
            return '[Circular]';
          }
          seen.add(v);
        }
        return v;
      });
    } catch {
      // Ultimate fallback: never crash the logger if a getter throws or proxy fails
      try {
        return JSON.stringify({
          error: '[SerializationFailed]',
          fallback: String(value),
        });
      } catch {
        return '{"error":"[SerializationFailed]"}';
      }
    }
  }
}

function writeToStream(isError: boolean, line: string): void {
  const stream =
    typeof process !== 'undefined' ? (isError ? process.stderr : process.stdout) : undefined;

  if (stream?.write) {
    stream.write(line);
  } else if (isError) {
    console.error(line.trimEnd());
  } else {
    console.log(line.trimEnd());
  }
}

function defaultSink(environment: LogEnvironment): LogSink {
  if (environment === 'development') {
    return (entry) => {
      const meta =
        Object.keys(entry.metadata).length > 0 ? ` ${safeStringify(entry.metadata)}` : '';
      const correlation = entry.correlationId ? ` [${entry.correlationId}]` : '';
      const line = `${entry.timestamp} ${entry.level.toUpperCase().padEnd(5)}${correlation} ${entry.message}${meta}\n`;
      const isError = entry.level === 'error' || entry.level === 'warn';
      writeToStream(isError, line);
    };
  }

  return (entry) => {
    const isError = entry.level === 'error' || entry.level === 'warn';
    writeToStream(isError, `${safeStringify(entry)}\n`);
  };
}

function createLoggerInternal(
  options: Required<Omit<LoggerOptions, 'sink'>> & { sink: LogSink },
): Logger {
  const write = (level: LogLevel, message: string, metadata: LogMetadata | undefined): void => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[options.level]) {
      return;
    }

    options.sink({
      level,
      message,
      timestamp: new Date().toISOString(),
      metadata: { ...options.metadata, ...metadata },
      correlationId: getCorrelationId(),
    });
  };

  return {
    debug: (message, metadata) => write('debug', message, metadata),
    info: (message, metadata) => write('info', message, metadata),
    warn: (message, metadata) => write('warn', message, metadata),
    error: (message, metadata) => write('error', message, metadata),
    child: (metadata) =>
      createLoggerInternal({
        ...options,
        metadata: { ...options.metadata, ...metadata },
      }),
  };
}

/**
 * Creates a new structured logger. Intentionally thin — zero heavy external transports, no internal aggregation.
 *
 * @remarks
 * Features:
 * - Automatic correlation ID extraction from `AsyncLocalStorage`.
 * - Cycle-safe and BigInt-safe (Discord snowflake) JSON serialization.
 * - Pretty human-readable output in `'development'` mode, NDJSON in `'production'` and `'staging'`.
 *
 * @example
 * ```ts
 * const logger = createLogger({
 *   environment: 'production',
 *   level: 'info',
 *   metadata: { service: 'bot' },
 * });
 *
 * logger.info('Bot initialized', { shardId: 0 });
 * ```
 *
 * @param options - Logger configuration options.
 * @returns Configured structured `Logger` instance.
 * @public
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const environment = options.environment ?? 'development';
  const level = options.level ?? (environment === 'development' ? 'debug' : 'info');

  return createLoggerInternal({
    level,
    environment,
    metadata: options.metadata ?? {},
    sink: options.sink ?? defaultSink(environment),
  });
}
