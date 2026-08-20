import { CirceError } from "../errors/circe-error.js";
import { normalizeError } from "../errors/normalize-error.js";

export type LifecycleState = "created" | "starting" | "running" | "stopping" | "stopped";

export type LifecycleHook = () => void | Promise<void>;

/** Raised for invalid state transitions or hook failures during a phase change. */
export class LifecycleError extends CirceError {}

/**
 * A small explicit state machine driving an application through
 * created → start → running → stop → stopped.
 *
 * There is deliberately no separate `initialize` phase ahead of `start`:
 * every piece of startup wiring (event/command attachment, login,
 * registration) runs from a single `onStart` hook, and a second
 * pre-running phase would only exist for its own sake — dead API surface
 * nothing in the Discord layer needs.
 */
export class Lifecycle {
  #state: LifecycleState = "created";
  #startHooks: LifecycleHook[] = [];
  #stopHooks: LifecycleHook[] = [];

  get state(): LifecycleState {
    return this.#state;
  }

  onStart(hook: LifecycleHook): void {
    this.#startHooks.push(hook);
  }

  /** Stop hooks run in reverse registration order (last started, first stopped). */
  onStop(hook: LifecycleHook): void {
    this.#stopHooks.push(hook);
  }

  async start(): Promise<void> {
    if (this.#state !== "created") {
      throw new LifecycleError(`Cannot start from state "${this.#state}"`, { operational: true });
    }

    this.#state = "starting";

    try {
      for (const hook of this.#startHooks) {
        await hook();
      }
    } catch (error) {
      this.#state = "stopped";
      throw normalizeError(error, "Circe startup failed");
    }

    this.#state = "running";
  }

  /**
   * Stops the application. Idempotent: calling `stop()` again once already
   * stopped resolves immediately without re-running hooks. Every stop hook
   * runs even if an earlier one throws; failures are collected and raised
   * together at the end so cleanup is never partially skipped.
   */
  async stop(): Promise<void> {
    if (this.#state === "stopped" || this.#state === "created") {
      this.#state = "stopped";
      return;
    }

    this.#state = "stopping";

    const failures: CirceError[] = [];
    for (const hook of [...this.#stopHooks].reverse()) {
      try {
        await hook();
      } catch (error) {
        failures.push(normalizeError(error, "Shutdown hook failed"));
      }
    }

    this.#state = "stopped";

    if (failures.length > 0) {
      throw new LifecycleError(`${failures.length} shutdown hook(s) failed`, {
        operational: false,
        metadata: { failures },
      });
    }
  }
}
