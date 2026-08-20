import { CirceError } from "./circe-error.js";

/**
 * Converts an unknown thrown value into a `CirceError`, preserving the
 * original value as `cause`. Values that are already a `CirceError` pass
 * through unchanged so correlation/metadata attached upstream isn't lost.
 */
export function normalizeError(value: unknown, fallbackMessage = "Unknown error"): CirceError {
  if (value instanceof CirceError) {
    return value;
  }

  if (value instanceof Error) {
    return new CirceError(value.message || fallbackMessage, {
      cause: value,
      operational: false,
    });
  }

  return new CirceError(fallbackMessage, {
    cause: value,
    operational: false,
    metadata: { originalValue: value },
  });
}
