import type { Client, ClientEvents } from 'discord.js';
import { normalizeError } from '../../errors/normalize-error.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import { type ErrorReporter, reportError } from '../../observability/report-error.js';
import { EventError } from './errors.js';
import type { EventRegistry } from './registry.js';
import type { EventDefinition } from './types.js';

/**
 * Creates an event listener wrapper providing correlation context and per-listener error isolation.
 *
 * @remarks
 * Exposed separately from {@link attachEvents} so that handler behavior can be tested in isolation
 * without requiring a live Discord client connection.
 * Any unhandled error during event execution is normalized, logged with its correlation ID,
 * and forwarded to the optional error reporter without crashing the application process.
 *
 * @typeParam EventName - The Discord.js client event name.
 * @param event - The event definition to wrap.
 * @param logger - Logger instance for operational diagnostics.
 * @param onError - Optional error reporting callback.
 * @returns An event handler function ready to attach to an `EventEmitter`.
 * @public
 */
export function createEventHandler<EventName extends keyof ClientEvents>(
  event: EventDefinition<EventName>,
  logger: Logger,
  onError?: ErrorReporter,
): (...args: ClientEvents[EventName]) => void {
  return (...args: ClientEvents[EventName]) => {
    void withCorrelationId(async () => {
      try {
        await event.execute(...args);
      } catch (error) {
        const normalized = normalizeError(error, `Event "${String(event.name)}" handler failed`);
        const eventError =
          normalized instanceof EventError
            ? normalized
            : new EventError(normalized.message, {
                cause: normalized,
                operational: normalized.operational,
                metadata: { ...normalized.metadata, reason: 'handler-failed', event: event.name },
              });
        logger.error(eventError.message, {
          error: eventError,
          event: event.name,
          correlationId: eventError.correlationId,
        });
        await reportError(
          onError,
          eventError,
          {
            kind: 'event',
            name: String(event.name),
            correlationId: getCorrelationId(),
            timestamp: new Date().toISOString(),
          },
          logger,
        );
      }
    });
  };
}

/**
 * Attaches every registered event listener onto a live Discord.js client.
 *
 * @remarks
 * Respects the `once` flag on {@link EventDefinition}, calling `client.once()` for one-time
 * listeners and `client.on()` for recurring listeners. Discord.js's native EventEmitter remains
 * the underlying event bus.
 *
 * @param client - The target Discord.js client instance.
 * @param registry - Registry containing the loaded event definitions.
 * @param logger - Logger instance.
 * @param onError - Optional error reporting callback.
 * @public
 */
export function attachEvents(
  client: Client,
  registry: EventRegistry,
  logger: Logger,
  onError?: ErrorReporter,
): void {
  for (const event of registry.all) {
    const handler = createEventHandler(event, logger.child({ event: String(event.name) }), onError);
    if (event.once) {
      client.once(event.name, handler as never);
    } else {
      client.on(event.name, handler as never);
    }
  }
}
