import { describe, expect, test } from "bun:test";
import { Lifecycle, LifecycleError } from "../../src/application/lifecycle.js";

describe("Lifecycle", () => {
  test("starts in the created state", () => {
    expect(new Lifecycle().state).toBe("created");
  });

  test("moves from created to running on start()", async () => {
    const lifecycle = new Lifecycle();
    await lifecycle.start();
    expect(lifecycle.state).toBe("running");
  });

  test("runs start hooks in registration order", async () => {
    const lifecycle = new Lifecycle();
    const calls: string[] = [];
    lifecycle.onStart(() => {
      calls.push("first");
    });
    lifecycle.onStart(() => {
      calls.push("second");
    });

    await lifecycle.start();
    expect(calls).toEqual(["first", "second"]);
  });

  test("stop() runs stop hooks in reverse registration order", async () => {
    const lifecycle = new Lifecycle();
    const calls: string[] = [];
    lifecycle.onStop(() => {
      calls.push("first");
    });
    lifecycle.onStop(() => {
      calls.push("second");
    });

    await lifecycle.start();
    await lifecycle.stop();

    expect(calls).toEqual(["second", "first"]);
    expect(lifecycle.state).toBe("stopped");
  });

  test("stop() is idempotent — calling it again does not rerun hooks", async () => {
    const lifecycle = new Lifecycle();
    let stopCount = 0;
    lifecycle.onStop(() => {
      stopCount += 1;
    });

    await lifecycle.start();
    await lifecycle.stop();
    await lifecycle.stop();

    expect(stopCount).toBe(1);
    expect(lifecycle.state).toBe("stopped");
  });

  test("stop() before start() is a safe no-op", async () => {
    const lifecycle = new Lifecycle();
    await expect(lifecycle.stop()).resolves.toBeUndefined();
    expect(lifecycle.state).toBe("stopped");
  });

  test("start() rejects and does not transition to running when a start hook throws", async () => {
    const lifecycle = new Lifecycle();
    lifecycle.onStart(() => {
      throw new Error("boom");
    });

    await expect(lifecycle.start()).rejects.toThrow("boom");
    expect(lifecycle.state).toBe("stopped");
  });

  test("start() cannot run twice", async () => {
    const lifecycle = new Lifecycle();
    await lifecycle.start();
    await expect(lifecycle.start()).rejects.toBeInstanceOf(LifecycleError);
  });

  test("start() after a failed start also rejects (state is already 'stopped')", async () => {
    const lifecycle = new Lifecycle();
    lifecycle.onStart(() => {
      throw new Error("boom");
    });

    await expect(lifecycle.start()).rejects.toThrow("boom");
    await expect(lifecycle.start()).rejects.toBeInstanceOf(LifecycleError);
  });

  test("stop() still runs every hook even if an earlier one throws, then reports the failure", async () => {
    const lifecycle = new Lifecycle();
    const calls: string[] = [];
    lifecycle.onStop(() => {
      calls.push("first");
      throw new Error("cleanup failed");
    });
    lifecycle.onStop(() => {
      calls.push("second");
    });

    await lifecycle.start();
    await expect(lifecycle.stop()).rejects.toBeInstanceOf(LifecycleError);

    expect(calls).toEqual(["second", "first"]);
    expect(lifecycle.state).toBe("stopped");
  });
});
