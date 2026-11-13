import { AsyncLocalStorage } from 'node:async_hooks';

interface CorrelationContext {
  correlationId: string;
  parentCorrelationId: string | undefined;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Generates a new correlation ID using standard Web Crypto UUIDv4.
 * Not tied to any active async context.
 *
 * @returns A standard RFC 4122 UUIDv4 string.
 * @public
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Runs `fn` inside a new correlation context. If a correlation ID is already
 * active, it's recorded as the parent — nested calls get their own ID while
 * still being traceable back to the operation that started them.
 *
 * @remarks
 * Uses `AsyncLocalStorage` to propagate the correlation context across asynchronous
 * microtasks, promises, and timers without needing manual parameter passing.
 *
 * @example
 * ```ts
 * await withCorrelationId(async () => {
 *   logger.info('Processing interaction'); // automatically logs correlationId
 *   await handleOperation();
 * });
 * ```
 *
 * @param fn - Synchronous or asynchronous callback to execute within the correlation scope.
 * @param correlationId - Optional correlation ID. Defaults to a newly generated UUIDv4.
 * @returns The value returned by `fn`.
 * @public
 */
export function withCorrelationId<T>(
  fn: () => T,
  correlationId: string = generateCorrelationId(),
): T {
  const parent = storage.getStore();
  return storage.run({ correlationId, parentCorrelationId: parent?.correlationId }, fn);
}

/**
 * Returns the correlation ID active in the current async execution context, if any.
 *
 * @returns The currently active correlation ID, or `undefined` if outside any correlation context.
 * @public
 */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Returns the parent correlation ID of the current context, if nested.
 *
 * @returns The parent context's correlation ID, or `undefined` if unnested or outside any context.
 * @public
 */
export function getParentCorrelationId(): string | undefined {
  return storage.getStore()?.parentCorrelationId;
}
