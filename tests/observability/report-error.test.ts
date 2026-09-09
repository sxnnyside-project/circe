import { describe, expect, test } from "bun:test";
import { CirceError } from "../../src/errors/circe-error.js";
import { createLogger, type LogEntry } from "../../src/logging/logger.js";
import { reportError } from "../../src/observability/report-error.js";

function silentLogger(): { logger: ReturnType<typeof createLogger>; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { logger: createLogger({ sink: (entry) => entries.push(entry) }), entries };
}

describe("reportError", () => {
  test("does nothing when no reporter is given", async () => {
    const { logger, entries } = silentLogger();
    await reportError(
      undefined,
      new CirceError("boom"),
      { kind: "command", name: "ping", correlationId: "c1" },
      logger,
    );
    expect(entries).toHaveLength(0);
  });

  test("calls the reporter with the error and context", async () => {
    const calls: unknown[] = [];
    const { logger } = silentLogger();
    const error = new CirceError("boom");
    const context = { kind: "command" as const, name: "ping", correlationId: "c1" };

    await reportError(
      (err, ctx) => {
        calls.push({ err, ctx });
      },
      error,
      context,
      logger,
    );

    expect(calls).toEqual([{ err: error, ctx: context }]);
  });

  test("awaits an async reporter before returning", async () => {
    const { logger } = silentLogger();
    let resolved = false;

    await reportError(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        resolved = true;
      },
      new CirceError("boom"),
      { kind: "event", name: "ready", correlationId: undefined },
      logger,
    );

    expect(resolved).toBe(true);
  });

  test("catches a throwing reporter and logs it instead of propagating", async () => {
    const { logger, entries } = silentLogger();
    const error = new CirceError("original");

    await reportError(
      () => {
        throw new Error("reporter exploded");
      },
      error,
      { kind: "command", name: "ping", correlationId: undefined },
      logger,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain("Error reporter threw");
  });

  test("catches a rejecting async reporter and logs it instead of propagating", async () => {
    const { logger, entries } = silentLogger();

    await reportError(
      async () => {
        throw new Error("async reporter exploded");
      },
      new CirceError("original"),
      { kind: "modal", name: "form:", correlationId: undefined },
      logger,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain("Error reporter threw");
  });
});
