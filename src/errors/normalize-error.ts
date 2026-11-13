import { CirceError } from './circe-error.js';

/**
 * Converts an unknown thrown value into a `CirceError`, preserving the
 * original value as `cause` and annotating `originalName` in metadata.
 *
 * @remarks
 * Values that are already a `CirceError` pass through unchanged so correlation
 * context and existing metadata attached upstream are preserved without duplication.
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   const circeError = normalizeError(err, 'Failed to execute operation');
 *   logger.error('Error occurred', circeError);
 * }
 * ```
 *
 * @param value - The caught unknown error, exception, or primitive value.
 * @param fallbackMessage - Fallback message if `value` is not an Error or has no message.
 * @returns A normalized `CirceError` instance.
 * @public
 */
export function normalizeError(value: unknown, fallbackMessage = 'Unknown error'): CirceError {
  if (value instanceof CirceError) {
    return value;
  }

  if (value instanceof Error) {
    return new CirceError(value.message || fallbackMessage, {
      cause: value,
      operational: false,
      metadata: { originalName: value.name },
    });
  }

  return new CirceError(fallbackMessage, {
    cause: value,
    operational: false,
    metadata: { originalValue: value },
  });
}
