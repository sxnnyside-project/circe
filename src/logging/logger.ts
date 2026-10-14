import { getCorrelationId } from './context.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEnvironment = 'development' | 'staging' | 'production';

export type LogMetadata = Record<string, unknown>;

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata: LogMetadata;
  correlationId: string | undefined;
}

export interface Logger {
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
  /** Returns a new logger that merges `metadata` into every entry it writes. */
  child(metadata: LogMetadata): Logger;
}

export type LogSink = (entry: LogEntry) => void;

export interface LoggerOptions {
  /** Minimum level written. Defaults to "debug" in development, "info" otherwise. */
  level?: LogLevel;
  /** Controls output formatting: pretty text in development, structured JSON otherwise. */
  environment?: LogEnvironment;
  /** Base metadata merged into every entry (e.g. a component/module name). */
  metadata?: LogMetadata;
  /**
   * Where entries are written. Defaults to stdout (JSON) / a formatted line
   * on process.stdout, chosen by `environment`. Overriding this is how a bot
   * plugs in its own transport later without Circe needing to know about it.
   */
  sink?: LogSink;
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
 * `JSON.stringify` throws on circular references and `BigInt`s. A logger's
 * job includes reporting failures, sometimes during shutdown — it must
 * never itself become the thing that throws. Falls back to a message-only
 * line rather than losing the entry (or crashing) when metadata can't be
 * serialized as-is. Errors are always expanded: a bare `{}` would drop the
 * very reason the line was written.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v: unknown) => (v instanceof Error ? errorToJson(v) : v));
  } catch {
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
  }
}

function defaultSink(environment: LogEnvironment): LogSink {
  if (environment === 'development') {
    return (entry) => {
      const meta =
        Object.keys(entry.metadata).length > 0 ? ` ${safeStringify(entry.metadata)}` : '';
      const correlation = entry.correlationId ? ` [${entry.correlationId}]` : '';
      const line = `${entry.timestamp} ${entry.level.toUpperCase().padEnd(5)}${correlation} ${entry.message}${meta}\n`;
      const stream =
        entry.level === 'error' || entry.level === 'warn' ? process.stderr : process.stdout;
      stream.write(line);
    };
  }

  return (entry) => {
    const stream =
      entry.level === 'error' || entry.level === 'warn' ? process.stderr : process.stdout;
    stream.write(`${safeStringify(entry)}\n`);
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

/** Creates a new structured logger. Intentionally thin — no transports, no aggregation. */
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
