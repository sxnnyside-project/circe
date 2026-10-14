import { AsyncLocalStorage } from 'node:async_hooks';

interface CorrelationContext {
  correlationId: string;
  parentCorrelationId: string | undefined;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** Generates a new correlation ID. Not tied to any active context. */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/** Returns the correlation ID active in the current async context, if any. */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Runs `fn` inside a new correlation context. If a correlation ID is already
 * active, it's recorded as the parent — nested calls get their own ID while
 * still being traceable back to the operation that started them.
 *
 * This is the one place correlation IDs get created or propagated; callers
 * elsewhere never need to pass an ID by hand.
 */
export function withCorrelationId<T>(
  fn: () => T,
  correlationId: string = generateCorrelationId(),
): T {
  const parent = storage.getStore();
  return storage.run({ correlationId, parentCorrelationId: parent?.correlationId }, fn);
}

/** Returns the parent correlation ID of the current context, if nested. */
export function getParentCorrelationId(): string | undefined {
  return storage.getStore()?.parentCorrelationId;
}
