import { createLogger, type LogEntry, type Logger } from '../logging/logger.js';

/**
 * In-memory test logger recording structured log entries.
 *
 * @public
 */
export interface TestLogger {
  /** The test logger instance. */
  readonly logger: Logger;
  /** In-memory log buffer containing every entry recorded in chronological order. */
  readonly entries: LogEntry[];
}

/**
 * Creates an in-memory logger that buffers log entries for test assertions.
 *
 * @remarks
 * Avoids writing output to stdout or stderr during unit tests and enables inspection
 * of structured log metadata and correlation IDs.
 *
 * @returns A {@link TestLogger} containing the logger and buffered `entries` array.
 *
 * @example
 * ```typescript
 * import { createTestLogger } from '@sxnnyside/circe/testing';
 *
 * const { logger, entries } = createTestLogger();
 * logger.info('Task started', { taskId: 'abc' });
 * expect(entries).toHaveLength(1);
 * ```
 *
 * @public
 */
export function createTestLogger(): TestLogger {
  const entries: LogEntry[] = [];
  const logger = createLogger({ sink: (entry) => entries.push(entry) });
  return { logger, entries };
}
