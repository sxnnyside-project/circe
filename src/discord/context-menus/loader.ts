import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleValidationError } from "../../errors/module-validation-error.js";
import type { Logger } from "../../logging/logger.js";
import { discoverModules } from "../module-loader.js";
import type { ContextMenuCommandRegistry } from "./registry.js";
import type { MessageCommandDefinition, UserCommandDefinition } from "./types.js";

export interface LoadContextMenuCommandsOptions {
  registry: ContextMenuCommandRegistry;
  logger: Logger;
}

function validateContextMenuCommandShape(value: unknown): string[] {
  if (typeof value !== "object" || value === null) {
    return ["does not export a default context menu command definition object"];
  }

  const candidate = value as Partial<UserCommandDefinition>;
  const issues: string[] = [];

  if (typeof candidate.execute !== "function") {
    issues.push("missing `execute`");
  }
  if (typeof candidate.name !== "string") {
    issues.push("missing `name`");
  }

  return issues;
}

/**
 * Discovers user and message context menu commands under the fixed
 * `users/` and `messages/` subfolders of `directory` — this split isn't
 * cosmetic, it determines which interaction type each command registers
 * as (see folder-conventions.md, Section 3.3). Every malformed or
 * unimportable file across both subfolders is aggregated into one
 * `ModuleValidationError`, mirroring every other category loader.
 */
export async function loadContextMenuCommands(
  directory: string | URL,
  options: LoadContextMenuCommandsOptions,
): Promise<void> {
  const directoryPath = directory instanceof URL ? fileURLToPath(directory) : directory;
  const issues: { file: string; message: string }[] = [];

  const validUsers: { fileName: string; value: UserCommandDefinition }[] = [];
  const usersDir = path.join(directoryPath, "users");
  if (existsSync(usersDir)) {
    const { modules, failures } = await discoverModules(usersDir);
    issues.push(
      ...failures.map((failure) => ({
        file: path.join("users", failure.fileName),
        message: `Failed to import: ${failure.cause instanceof Error ? failure.cause.message : String(failure.cause)}`,
      })),
    );
    for (const { fileName, value } of modules) {
      const shapeIssues = validateContextMenuCommandShape(value);
      if (shapeIssues.length > 0) {
        issues.push(...shapeIssues.map((message) => ({ file: path.join("users", fileName), message })));
      } else {
        validUsers.push({ fileName, value: value as UserCommandDefinition });
      }
    }
  }

  const validMessages: { fileName: string; value: MessageCommandDefinition }[] = [];
  const messagesDir = path.join(directoryPath, "messages");
  if (existsSync(messagesDir)) {
    const { modules, failures } = await discoverModules(messagesDir);
    issues.push(
      ...failures.map((failure) => ({
        file: path.join("messages", failure.fileName),
        message: `Failed to import: ${failure.cause instanceof Error ? failure.cause.message : String(failure.cause)}`,
      })),
    );
    for (const { fileName, value } of modules) {
      const shapeIssues = validateContextMenuCommandShape(value);
      if (shapeIssues.length > 0) {
        issues.push(...shapeIssues.map((message) => ({ file: path.join("messages", fileName), message })));
      } else {
        validMessages.push({ fileName, value: value as MessageCommandDefinition });
      }
    }
  }

  if (issues.length > 0) {
    throw new ModuleValidationError(`${issues.length} context menu command module issue(s) found`, {
      category: "context-menus",
      issues,
    });
  }

  for (const { fileName, value } of validUsers) {
    options.registry.registerUser(value);
    options.logger.debug(`Loaded user context menu command "${value.name}"`, { file: fileName });
  }
  for (const { fileName, value } of validMessages) {
    options.registry.registerMessage(value);
    options.logger.debug(`Loaded message context menu command "${value.name}"`, { file: fileName });
  }
}
