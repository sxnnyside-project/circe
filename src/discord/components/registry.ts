import { DiscoveryConflictError } from '../../errors/discovery-conflict-error.js';
import type { ComponentDefinition } from './types.js';

/**
 * In-memory registry storing registered message component handlers.
 *
 * @remarks
 * Uses longest-prefix-match resolution: if both `"ticket:"` and `"ticket:close:"`
 * are registered, a `customId` of `"ticket:close:123"` routes to the more specific
 * `"ticket:close:"` handler regardless of registration order.
 *
 * @public
 */
export class ComponentRegistry {
  readonly #handlers = new Map<string, ComponentDefinition>();

  /**
   * Registers a component handler into the registry.
   *
   * @typeParam Metadata - Bot-defined custom metadata shape.
   * @typeParam Params - Parsed parameters type.
   * @param component - The component handler definition to register.
   * @throws {@link DiscoveryConflictError} If `prefix` is empty or already registered.
   */
  register<Metadata extends Record<string, unknown>, Params = undefined>(
    component: ComponentDefinition<Metadata, Params>,
  ): void {
    const { prefix } = component;

    if (!prefix) {
      throw new DiscoveryConflictError('Component handler is missing a prefix', {
        category: 'components',
        reason: 'missing-identity',
      });
    }

    if (this.#handlers.has(prefix)) {
      throw new DiscoveryConflictError(`Duplicate component prefix "${prefix}"`, {
        category: 'components',
        reason: 'duplicate',
        identity: prefix,
      });
    }

    this.#handlers.set(prefix, component as unknown as ComponentDefinition);
  }

  /**
   * Resolves the most specific registered handler whose prefix matches `customId`.
   *
   * @param customId - The interaction's incoming customId string.
   * @returns The matching {@link ComponentDefinition}, or `undefined` if no prefix matches.
   */
  resolve(customId: string): ComponentDefinition | undefined {
    let best: ComponentDefinition | undefined;
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
   * Checks whether a component prefix is registered.
   *
   * @param prefix - The prefix string.
   * @returns `true` if registered; otherwise `false`.
   */
  has(prefix: string): boolean {
    return this.#handlers.has(prefix);
  }

  /**
   * Array of all currently registered component handler definitions.
   */
  get all(): readonly ComponentDefinition[] {
    return [...this.#handlers.values()];
  }

  /**
   * Total number of component handlers currently registered.
   */
  get size(): number {
    return this.#handlers.size;
  }
}
