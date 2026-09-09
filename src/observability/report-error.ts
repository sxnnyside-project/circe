import type { CirceError } from "../errors/circe-error.js";
import type { Logger } from "../logging/logger.js";
import type { ErrorReportContext, ErrorReporter } from "./types.js";

/**
 * Invokes `reporter` (if any) with `error`/`context`, isolating any failure
 * from the caller — a reporter that throws (a misconfigured Sentry client,
 * a network error sending a span) is logged and swallowed, never allowed to
 * break the user-facing error handling it runs alongside.
 */
export async function reportError(
  reporter: ErrorReporter | undefined,
  error: CirceError,
  context: ErrorReportContext,
  logger: Logger,
): Promise<void> {
  if (!reporter) {
    return;
  }

  try {
    await reporter(error, context);
  } catch (reportingError) {
    logger.error("Error reporter threw while reporting an error", {
      error: reportingError,
      originalError: error,
      context,
    });
  }
}
