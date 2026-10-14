import type { ClientEvents } from 'discord.js';
import { createEventHandler } from '../discord/events/dispatcher.js';
import type { EventDefinition } from '../discord/events/types.js';
import type { LogEntry } from '../logging/logger.js';
import { createTestLogger } from './logger.js';

export interface TestEventResult {
  logs: LogEntry[];
}

/**
 * Invokes an event's `execute()` through Circe's real dispatcher — the same
 * correlation-context wrapping and error isolation `attachEvents` gives a
 * live client — with plain arguments instead of real gateway payloads.
 * Awaiting the result is enough to observe a handler that threw: the
 * failure shows up as a logged entry, never as a rejected promise, exactly
 * as it would in production.
 */
export async function testEvent<EventName extends keyof ClientEvents>(
  event: EventDefinition<EventName>,
  ...args: ClientEvents[EventName]
): Promise<TestEventResult> {
  const { logger, entries } = createTestLogger();
  const handler = createEventHandler(event, logger);

  handler(...args);
  await new Promise((resolve) => setImmediate(resolve));

  return { logs: entries };
}
