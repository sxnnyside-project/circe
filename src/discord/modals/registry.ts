import { ModalError } from "./errors.js";
import type { ModalDefinition } from "./types.js";

/**
 * Holds the modal handlers a Circe application knows about. Same
 * longest-prefix-match resolution as `ComponentRegistry` — see there for
 * the reasoning.
 */
export class ModalRegistry {
  #handlers = new Map<string, ModalDefinition>();

  register<Metadata extends Record<string, unknown>>(modal: ModalDefinition<Metadata>): void {
    const { prefix } = modal;

    if (!prefix) {
      throw new ModalError("Modal handler is missing a prefix", {
        metadata: { reason: "missing-prefix" },
      });
    }

    if (this.#handlers.has(prefix)) {
      throw new ModalError(`Duplicate modal prefix "${prefix}"`, {
        metadata: { reason: "duplicate", prefix },
      });
    }

    this.#handlers.set(prefix, modal as ModalDefinition);
  }

  /** Resolves the most specific registered handler whose prefix matches `customId`, if any. */
  resolve(customId: string): ModalDefinition | undefined {
    let best: ModalDefinition | undefined;
    let bestLength = -1;

    for (const [prefix, handler] of this.#handlers) {
      if (prefix.length > bestLength && customId.startsWith(prefix)) {
        best = handler;
        bestLength = prefix.length;
      }
    }

    return best;
  }

  has(prefix: string): boolean {
    return this.#handlers.has(prefix);
  }

  get all(): readonly ModalDefinition[] {
    return [...this.#handlers.values()];
  }

  get size(): number {
    return this.#handlers.size;
  }
}
