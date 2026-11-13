import { DiscoveryConflictError } from '../../errors/discovery-conflict-error.js';
import type { ModalDefinition } from './types.js';

/**
 * In-memory registry storing modal submission handlers.
 *
 * @remarks
 * Uses longest-prefix-match resolution to route modal interactions by their `customId`,
 * allowing static prefixes (e.g. `feedback:`) to handle dynamically parameterized
 * identifiers (e.g. `feedback:user_123:session_456`).
 *
 * @public
 */
export class ModalRegistry {
  readonly #handlers = new Map<string, ModalDefinition>();

  /**
   * Registers a modal definition into the registry.
   *
   * @typeParam Metadata - Bot-defined custom metadata shape.
   * @param modal - The modal definition to register.
   * @throws {@link DiscoveryConflictError} If the prefix is missing or already registered.
   */
  register<Metadata extends Record<string, unknown>>(modal: ModalDefinition<Metadata>): void {
    const { prefix } = modal;

    if (!prefix) {
      throw new DiscoveryConflictError('Modal handler is missing a prefix', {
        category: 'modals',
        reason: 'missing-identity',
      });
    }

    if (this.#handlers.has(prefix)) {
      throw new DiscoveryConflictError(`Duplicate modal prefix "${prefix}"`, {
        category: 'modals',
        reason: 'duplicate',
        identity: prefix,
      });
    }

    this.#handlers.set(prefix, modal as unknown as ModalDefinition);
  }

  /**
   * Resolves the most specific registered handler whose prefix matches `customId`.
   *
   * @param customId - The incoming modal submission customId.
   * @returns The matching {@link ModalDefinition}, or `undefined` if no handler matches.
   */
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

  /**
   * Checks whether a modal prefix is already registered.
   *
   * @param prefix - Prefix to check.
   * @returns `true` if registered, `false` otherwise.
   */
  has(prefix: string): boolean {
    return this.#handlers.has(prefix);
  }

  /**
   * All registered modal definitions.
   */
  get all(): readonly ModalDefinition[] {
    return [...this.#handlers.values()];
  }

  /**
   * Total number of registered modal handlers.
   */
  get size(): number {
    return this.#handlers.size;
  }
}
