import { DiscoveryConflictError } from "../../errors/discovery-conflict-error.js";
import type { MessageCommandDefinition, UserCommandDefinition } from "./types.js";

/**
 * Holds user and message context menu commands. Two separate namespaces —
 * Discord allows a user command and a message command to share the same
 * name, since they're distinct command types — kept in one registry
 * because a bot loads and registers them together.
 */
export class ContextMenuCommandRegistry {
  #userCommands = new Map<string, UserCommandDefinition>();
  #messageCommands = new Map<string, MessageCommandDefinition>();

  registerUser<Metadata extends Record<string, unknown>>(command: UserCommandDefinition<Metadata>): void {
    if (this.#userCommands.has(command.name)) {
      throw new DiscoveryConflictError(`Duplicate user context menu command name "${command.name}"`, {
        category: "context-menus",
        reason: "duplicate",
        identity: command.name,
      });
    }
    this.#userCommands.set(command.name, command as UserCommandDefinition);
  }

  registerMessage<Metadata extends Record<string, unknown>>(command: MessageCommandDefinition<Metadata>): void {
    if (this.#messageCommands.has(command.name)) {
      throw new DiscoveryConflictError(`Duplicate message context menu command name "${command.name}"`, {
        category: "context-menus",
        reason: "duplicate",
        identity: command.name,
      });
    }
    this.#messageCommands.set(command.name, command as MessageCommandDefinition);
  }

  getUser(name: string): UserCommandDefinition | undefined {
    return this.#userCommands.get(name);
  }

  getMessage(name: string): MessageCommandDefinition | undefined {
    return this.#messageCommands.get(name);
  }

  get allUser(): readonly UserCommandDefinition[] {
    return [...this.#userCommands.values()];
  }

  get allMessage(): readonly MessageCommandDefinition[] {
    return [...this.#messageCommands.values()];
  }

  get size(): number {
    return this.#userCommands.size + this.#messageCommands.size;
  }
}
