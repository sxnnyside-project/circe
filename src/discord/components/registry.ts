import { DiscoveryConflictError } from '../../errors/discovery-conflict-error.js';
import type { ComponentDefinition } from './types.js';

/**
 * Holds the component handlers a Circe application knows about. Owned by
 * the application instance, not a module-level singleton.
 *
 * Resolution is longest-prefix-match: if both `"crate:"` and `"crate:save:"`
 * are registered, a customId of `"crate:save:123"` resolves to the more
 * specific `"crate:save:"` handler regardless of registration order. Only
 * an exact duplicate prefix is rejected at registration time — two
 * different-length prefixes that both happen to match the same customId
 * later is normal, intentional layering, not a conflict.
 */
export class ComponentRegistry {
  #handlers = new Map<string, ComponentDefinition>();

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

  /** Resolves the most specific registered handler whose prefix matches `customId`, if any. */
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

  has(prefix: string): boolean {
    return this.#handlers.has(prefix);
  }

  get all(): readonly ComponentDefinition[] {
    return [...this.#handlers.values()];
  }

  get size(): number {
    return this.#handlers.size;
  }
}
