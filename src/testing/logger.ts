import { createLogger, type LogEntry, type Logger } from "../logging/logger.js";

export interface TestLogger {
  readonly logger: Logger;
  /** Every entry written so far, in order. Mutated in place as the logger is used. */
  readonly entries: LogEntry[];
}

/**
 * A logger that records entries instead of writing them anywhere, for
 * asserting on what a command/event logged during a test. Avoids every
 * caller having to hand-build a `createLogger` with an array-collecting
 * `sink` themselves.
 */
export function createTestLogger(): TestLogger {
  const entries: LogEntry[] = [];
  const logger = createLogger({ sink: (entry) => entries.push(entry) });
  return { logger, entries };
}
