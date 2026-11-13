import type { ClientEvents } from 'discord.js';
import { createEventHandler } from '../discord/events/dispatcher.js';
import type { EventDefinition } from '../discord/events/types.js';
import type { LogEntry, LogLevel } from '../logging/logger.js';
import { createTestLogger } from './logger.js';

/**
 * Result of testing a Discord event handler.
 *
 * @public
 */
export interface TestEventResult {
  /** Structured log entries emitted during event execution. */
  readonly logs: readonly LogEntry[];
  /**
   * Asserts whether a log entry at the specified log level was recorded.
   *
   * @param level - Expected log severity level.
   * @param messageMatch - Optional message substring or regular expression to match.
   * @returns `true` if a matching log entry exists; otherwise `false`.
   */
  hasLog(level: LogLevel, messageMatch?: string | RegExp): boolean;
}

/**
 * Invokes an event handler through Circe's real dispatcher with correlation-context
 * wrapping and unhandled error isolation.
 *
 * @remarks
 * Awaiting the result allows observing handler behavior and thrown errors: failures
 * are caught and logged with error severity without rejecting the promise, exactly
 * as Circe guarantees in production.
 *
 * @param event - The event definition under test.
 * @param args - Arguments matching the event signature in Discord.js `ClientEvents`.
 * @returns A promise resolving to an ergonomic {@link TestEventResult}.
 *
 * @example
 * ```typescript
 * import { testEvent } from '@sxnnyside/circe/testing';
 * import readyEvent from './events/ready.js';
 *
 * const result = await testEvent(readyEvent, client);
 * expect(result.hasLog('info', 'Logged in as')).toBe(true);
 * ```
 *
 * @public
 */
export async function testEvent<EventName extends keyof ClientEvents>(
  event: EventDefinition<EventName>,
  ...args: ClientEvents[EventName]
): Promise<TestEventResult> {
  const { logger, entries } = createTestLogger();
  const handler = createEventHandler(event, logger);

  handler(...args);
  await new Promise((resolve) => setImmediate(resolve));

  return {
    logs: entries,
    hasLog(level: LogLevel, messageMatch?: string | RegExp): boolean {
      return entries.some((l) => {
        if (l.level !== level) return false;
        if (messageMatch === undefined) return true;
        if (typeof messageMatch === 'string') return l.message.includes(messageMatch);
        return messageMatch.test(l.message);
      });
    },
  };
}
