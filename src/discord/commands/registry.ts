import { DiscoveryConflictError } from '../../errors/discovery-conflict-error.js';
import type { CommandDefinition } from './types.js';

/**
 * Holds the commands a Circe application knows about. Owned by the
 * application instance created via `createCirce()` — not a module-level
 * singleton, so multiple apps in the same process never share state.
 */
export class CommandRegistry {
  #commands = new Map<string, CommandDefinition>();

  register<Metadata extends Record<string, unknown>>(command: CommandDefinition<Metadata>): void {
    const name = command.builder.name;

    if (!name) {
      throw new DiscoveryConflictError('Command builder is missing a name', {
        category: 'commands',
        reason: 'missing-identity',
      });
    }

    if (this.#commands.has(name)) {
      throw new DiscoveryConflictError(`Duplicate command name "${name}"`, {
        category: 'commands',
        reason: 'duplicate',
        identity: name,
      });
    }

    this.#commands.set(name, command as CommandDefinition);
  }

  get(name: string): CommandDefinition | undefined {
    return this.#commands.get(name);
  }

  has(name: string): boolean {
    return this.#commands.has(name);
  }

  get all(): readonly CommandDefinition[] {
    return [...this.#commands.values()];
  }

  get size(): number {
    return this.#commands.size;
  }
}
