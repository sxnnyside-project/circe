import type { Client, ClientEvents } from 'discord.js';
import { normalizeError } from '../../errors/normalize-error.js';
import { getCorrelationId, withCorrelationId } from '../../logging/context.js';
import type { Logger } from '../../logging/logger.js';
import { reportError } from '../../observability/report-error.js';
import type { ErrorReporter } from '../../observability/types.js';
import { EventError } from './errors.js';
import type { EventRegistry } from './registry.js';
import type { EventDefinition } from './types.js';

/**
 * Wraps an event's handler with correlation context and error isolation.
 * Exposed separately from `attachEvents` so a handler's behavior can be
 * unit tested by invoking it directly with plain arguments, without a live
 * client. This is the per-listener isolation guarantee: one handler
 * throwing never prevents other listeners (for this event or any other)
 * from running.
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
          { kind: 'event', name: String(event.name), correlationId: getCorrelationId() },
          logger,
        );
      }
    });
  };
}

/** Wires every registered event onto a live discord.js client. discord.js's own emitter remains the event bus. */
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
