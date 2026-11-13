import { DiscoveryConflictError } from '../../errors/discovery-conflict-error.js';
import type { MessageCommandDefinition, UserCommandDefinition } from './types.js';

/**
 * In-memory registry storing user and message context menu commands.
 *
 * @remarks
 * Maintains two separate internal namespaces for user commands and message commands.
 * Discord allows a user command and a message command to share the exact same name
 * because their application command types (`USER` vs `MESSAGE`) are distinct. Both
 * categories are managed through this single registry during discovery and lifecycle initialization.
 *
 * @public
 */
export class ContextMenuCommandRegistry {
  readonly #userCommands = new Map<string, UserCommandDefinition>();
  readonly #messageCommands = new Map<string, MessageCommandDefinition>();

  /**
   * Registers a user context menu command into the registry.
   *
   * @typeParam Metadata - Bot-defined custom metadata shape.
   * @param command - The user command definition to register.
   * @throws {@link DiscoveryConflictError} If a user context menu command with the same name is already registered.
   */
  registerUser<Metadata extends Record<string, unknown>>(
    command: UserCommandDefinition<Metadata>,
  ): void {
    if (this.#userCommands.has(command.name)) {
      throw new DiscoveryConflictError(
        `Duplicate user context menu command name "${command.name}"`,
        {
          category: 'context-menus',
          reason: 'duplicate',
          identity: command.name,
        },
      );
    }
    this.#userCommands.set(command.name, command as unknown as UserCommandDefinition);
  }

  /**
   * Registers a message context menu command into the registry.
   *
   * @typeParam Metadata - Bot-defined custom metadata shape.
   * @param command - The message command definition to register.
   * @throws {@link DiscoveryConflictError} If a message context menu command with the same name is already registered.
   */
  registerMessage<Metadata extends Record<string, unknown>>(
    command: MessageCommandDefinition<Metadata>,
  ): void {
    if (this.#messageCommands.has(command.name)) {
      throw new DiscoveryConflictError(
        `Duplicate message context menu command name "${command.name}"`,
        {
          category: 'context-menus',
          reason: 'duplicate',
          identity: command.name,
        },
      );
    }
    this.#messageCommands.set(command.name, command as unknown as MessageCommandDefinition);
  }

  /**
   * Resolves a registered user context menu command by name.
   *
   * @param name - The context menu command name.
   * @returns The registered {@link UserCommandDefinition}, or `undefined` if not found.
   */
  getUser(name: string): UserCommandDefinition | undefined {
    return this.#userCommands.get(name);
  }

  /**
   * Resolves a registered message context menu command by name.
   *
   * @param name - The context menu command name.
   * @returns The registered {@link MessageCommandDefinition}, or `undefined` if not found.
   */
  getMessage(name: string): MessageCommandDefinition | undefined {
    return this.#messageCommands.get(name);
  }

  /**
   * All registered user context menu commands.
   */
  get allUser(): readonly UserCommandDefinition[] {
    return [...this.#userCommands.values()];
  }

  /**
   * All registered message context menu commands.
   */
  get allMessage(): readonly MessageCommandDefinition[] {
    return [...this.#messageCommands.values()];
  }

  /**
   * Total number of registered context menu commands across both user and message types.
   */
  get size(): number {
    return this.#userCommands.size + this.#messageCommands.size;
  }
}
