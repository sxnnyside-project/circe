import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SlashCommandBuilder, SlashCommandSubcommandGroupBuilder } from "discord.js";
import type { Logger } from "../../../logging/logger.js";
import { CommandError } from "../errors.js";
import type { CommandRegistry } from "../registry.js";
import type { CommandContext } from "../types.js";
import type { CommandGroupDefinition, SubcommandDefinition } from "./types.js";

export interface LoadCommandGroupsOptions {
  registry: CommandRegistry;
  logger: Logger;
}

const GROUP_FILE_NAME = "_group.ts";
const MODULE_FILE_PATTERN = /\.(ts|js|mjs|cjs)$/;
const DECLARATION_FILE_PATTERN = /\.d\.(ts|mts|cts)$/;

interface GroupFolder {
  groupFile: string | undefined;
  files: string[];
  directories: string[];
}

async function scanGroupFolder(directoryPath: string): Promise<GroupFolder> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  let groupFile: string | undefined;
  const files: string[] = [];
  const directories: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isFile() && entry.name === GROUP_FILE_NAME) {
      groupFile = fullPath;
    } else if (entry.isFile() && MODULE_FILE_PATTERN.test(entry.name) && !DECLARATION_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      directories.push(fullPath);
    }
  }

  return { groupFile, files: files.sort(), directories: directories.sort() };
}

async function importDefault(filePath: string, describe: string): Promise<unknown> {
  try {
    const imported = (await import(pathToFileURL(filePath).href)) as { default?: unknown };
    return imported.default;
  } catch (error) {
    throw new CommandError(`Failed to import ${describe}`, {
      cause: error,
      metadata: { reason: "import-failed", file: filePath },
    });
  }
}

function isCommandGroupDefinition(value: unknown): value is CommandGroupDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<CommandGroupDefinition>;
  return typeof candidate.name === "string" && typeof candidate.description === "string";
}

function isSubcommandDefinition(value: unknown): value is SubcommandDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SubcommandDefinition>;
  return (
    typeof candidate.execute === "function" &&
    typeof candidate.builder === "object" &&
    candidate.builder !== null &&
    typeof (candidate.builder as { name?: unknown }).name === "string"
  );
}

async function loadGroupMetadata(filePath: string, relativePath: string): Promise<CommandGroupDefinition> {
  const value = await importDefault(filePath, `command group metadata "${relativePath}"`);
  if (!isCommandGroupDefinition(value)) {
    throw new CommandError(`"${relativePath}" does not export a valid default command group definition`, {
      metadata: { reason: "malformed", file: filePath },
    });
  }
  return value;
}

async function loadSubcommand(filePath: string, relativePath: string): Promise<SubcommandDefinition> {
  const value = await importDefault(filePath, `command group subcommand "${relativePath}"`);
  if (!isSubcommandDefinition(value)) {
    throw new CommandError(`"${relativePath}" does not export a valid default subcommand definition`, {
      metadata: { reason: "malformed", file: filePath },
    });
  }
  return value;
}

async function loadSubgroup(
  subgroupDirectory: string,
  subgroupName: string,
  relativeSubgroupPath: string,
): Promise<{ builder: SlashCommandSubcommandGroupBuilder; route: Map<string, SubcommandDefinition> }> {
  const { groupFile, files, directories } = await scanGroupFolder(subgroupDirectory);

  if (!groupFile) {
    throw new CommandError(`Subgroup folder "${relativeSubgroupPath}" is missing a ${GROUP_FILE_NAME} file`, {
      metadata: { reason: "missing-group-file", directory: subgroupDirectory },
    });
  }

  if (directories.length > 0) {
    const offender = path.join(relativeSubgroupPath, path.basename(directories[0] as string));
    throw new CommandError(`"${offender}" exceeds the maximum command-group nesting depth of two levels`, {
      metadata: { reason: "max-depth-exceeded", directory: subgroupDirectory },
    });
  }

  const subgroup = await loadGroupMetadata(groupFile, path.join(relativeSubgroupPath, GROUP_FILE_NAME));
  const builder = new SlashCommandSubcommandGroupBuilder().setName(subgroupName).setDescription(subgroup.description);
  const route = new Map<string, SubcommandDefinition>();

  for (const filePath of files) {
    const relativeEntryPath = path.join(relativeSubgroupPath, path.basename(filePath));
    const subcommand = await loadSubcommand(filePath, relativeEntryPath);
    builder.addSubcommand(subcommand.builder);
    route.set(`${subgroupName}.${subcommand.builder.name}`, subcommand);
  }

  return { builder, route };
}

async function loadGroup(
  groupDirectory: string,
  relativeGroupPath: string,
): Promise<{
  builder: SlashCommandBuilder;
  guards: CommandGroupDefinition["guards"];
  route: Map<string, SubcommandDefinition>;
}> {
  const { groupFile, files, directories } = await scanGroupFolder(groupDirectory);

  if (!groupFile) {
    throw new CommandError(`Group folder "${relativeGroupPath}" is missing a ${GROUP_FILE_NAME} file`, {
      metadata: { reason: "missing-group-file", directory: groupDirectory },
    });
  }

  const group = await loadGroupMetadata(groupFile, path.join(relativeGroupPath, GROUP_FILE_NAME));
  const builder = new SlashCommandBuilder().setName(group.name).setDescription(group.description);
  const route = new Map<string, SubcommandDefinition>();

  for (const filePath of files) {
    const relativeEntryPath = path.join(relativeGroupPath, path.basename(filePath));
    const subcommand = await loadSubcommand(filePath, relativeEntryPath);
    builder.addSubcommand(subcommand.builder);
    route.set(subcommand.builder.name, subcommand);
  }

  for (const dirPath of directories) {
    const subgroupName = path.basename(dirPath);
    const relativeEntryPath = path.join(relativeGroupPath, subgroupName);
    const subgroup = await loadSubgroup(dirPath, subgroupName, relativeEntryPath);
    builder.addSubcommandGroup(subgroup.builder);
    for (const [key, subcommand] of subgroup.route) {
      route.set(key, subcommand);
    }
  }

  return { builder, guards: group.guards, route };
}

function buildExecute(route: Map<string, SubcommandDefinition>) {
  return async (ctx: CommandContext): Promise<void> => {
    const subgroupName = ctx.interaction.options.getSubcommandGroup(false);
    const subcommandName = ctx.interaction.options.getSubcommand(false);

    if (!subcommandName) {
      throw new CommandError("Command group interaction is missing a subcommand", {
        metadata: { reason: "missing-subcommand", command: ctx.interaction.commandName },
      });
    }

    const key = subgroupName ? `${subgroupName}.${subcommandName}` : subcommandName;
    const subcommand = route.get(key);

    if (!subcommand) {
      throw new CommandError(`No subcommand registered for "${key}"`, {
        metadata: { reason: "unknown-subcommand", command: ctx.interaction.commandName, key },
      });
    }

    for (const guard of subcommand.guards ?? []) {
      const result = await guard(ctx);
      if (result !== true) {
        throw new CommandError(result, {
          metadata: { reason: "guard-denied", command: ctx.interaction.commandName, key },
        });
      }
    }

    await subcommand.execute(ctx);
  };
}

/**
 * Discovers every group folder directly under `directory` (each one
 * `command-groups/<name>/`), assembles it into a single Discord command —
 * one `SlashCommandBuilder` with nested subcommands/subcommand groups —
 * and registers it in `registry`, the same registry `loadCommands` writes
 * to. Routing to the right leaf's `execute()` happens inside the
 * assembled command's own `execute`, so the router and Discord
 * registration never need to know a group was ever a folder tree.
 */
export async function loadCommandGroups(directory: string | URL, options: LoadCommandGroupsOptions): Promise<void> {
  const directoryPath = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const groupDirs = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of groupDirs) {
    const groupDirectory = path.join(directoryPath, entry.name);
    const { builder, guards, route } = await loadGroup(groupDirectory, entry.name);

    options.registry.register({
      builder,
      ...(guards !== undefined ? { guards } : {}),
      execute: buildExecute(route),
    });
    options.logger.debug(`Loaded command group "${builder.name}"`, {
      directory: entry.name,
      subcommands: [...route.keys()],
    });
  }
}
