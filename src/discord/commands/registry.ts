import { DiscoveryConflictError } from '../../errors/discovery-conflict-error.js';
import type { CommandDefinition } from './types.js';

/**
 * In-memory registry storing registered slash command definitions.
 *
 * @remarks
 * Instantiated per {@link CirceApp} container rather than as a global singleton,
 * ensuring complete isolation across parallel test suites and processes.
 * Enforces identity validation and prevents name collisions.
 *
 * @public
 */
export class CommandRegistry {
  readonly #commands = new Map<string, CommandDefinition>();

  /**
   * Registers a new command definition into the registry.
   *
   * @typeParam Metadata - Bot-defined custom metadata shape.
   * @param command - The command definition to register.
   * @throws {@link DiscoveryConflictError} If `builder.name` is missing or already registered.
   */
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

    this.#commands.set(name, command as unknown as CommandDefinition);
  }

  /**
   * Resolves a registered command by its identifier.
   *
   * @param name - The command name.
   * @returns The registered {@link CommandDefinition}, or `undefined` if not found.
   */
  get(name: string): CommandDefinition | undefined {
    return this.#commands.get(name);
  }

  /**
   * Checks whether a command name is already registered.
   *
   * @param name - The command name.
   * @returns `true` if registered; otherwise `false`.
   */
  has(name: string): boolean {
    return this.#commands.has(name);
  }

  /**
   * Array of all currently registered command definitions.
   */
  get all(): readonly CommandDefinition[] {
    return [...this.#commands.values()];
  }

  /**
   * Total number of commands currently registered.
   */
  get size(): number {
    return this.#commands.size;
  }
}
