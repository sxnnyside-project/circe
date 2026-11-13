import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CirceError } from '../errors/circe-error.js';

/**
 * Supported artifact kinds for code generation.
 *
 * @public
 */
export type AddArtifactKind = 'command' | 'event' | 'component' | 'modal' | 'guard';

/**
 * Options configuring code generation for {@link runAdd}.
 *
 * @public
 */
export interface AddOptions {
  /** The kind of artifact to scaffold. */
  readonly kind: AddArtifactKind;
  /** Name / identifier of the artifact. */
  readonly name: string;
  /** Description for slash commands. */
  readonly description?: string | undefined;
  /** Whether the command requires guild context. */
  readonly guildOnly?: boolean | undefined;
  /** Whether an event should fire only once. */
  readonly once?: boolean | undefined;
  /** Custom ID prefix for components or modals. */
  readonly prefix?: string | undefined;
  /** Structured custom ID pattern for components. */
  readonly pattern?: string | undefined;
  /** Overwrite destination file if it already exists. */
  readonly force?: boolean | undefined;
}

/**
 * Result returned by {@link runAdd}.
 *
 * @public
 */
export interface AddResult {
  /** Whether the file was written to disk. */
  readonly created: boolean;
  /** Absolute path of generated file. */
  readonly filePath: string;
  /** Relative path from project root. */
  readonly relativePath: string;
  /** Generated artifact kind. */
  readonly kind: AddArtifactKind;
  /** Artifact name. */
  readonly name: string;
}

/**
 * Known Discord.js event mapping for canonical Event enum references.
 */
const KNOWN_EVENTS: Record<string, string> = {
  ready: 'ClientReady',
  clientready: 'ClientReady',
  interactioncreate: 'InteractionCreate',
  messagecreate: 'MessageCreate',
  messagedelete: 'MessageDelete',
  messageupdate: 'MessageUpdate',
  guildcreate: 'GuildCreate',
  guilddelete: 'GuildDelete',
  guildmemberadd: 'GuildMemberAdd',
  guildmemberremove: 'GuildMemberRemove',
  guildmemberupdate: 'GuildMemberUpdate',
  error: 'Error',
  warn: 'Warn',
};

/** Renders `value` as a single-quoted string literal, so user text cannot break the generated file. */
function quote(value: string): string {
  const escaped = JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

/**
 * Generates file template contents based on requested artifact options.
 *
 * @internal
 */
export function generateTemplateContent(options: AddOptions): string {
  const cleanName = options.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

  switch (options.kind) {
    case 'command': {
      const desc = options.description ?? `The /${cleanName} slash command.`;
      const hasGuards = Boolean(options.guildOnly);
      const imports = hasGuards
        ? `import { defineCommand, guildOnly } from '@sxnnyside/circe';\nimport { SlashCommandBuilder } from 'discord.js';`
        : `import { defineCommand } from '@sxnnyside/circe';\nimport { SlashCommandBuilder } from 'discord.js';`;

      const guardsClause = hasGuards ? `\n  guards: [guildOnly],` : '';

      return `${imports}

export default defineCommand({
  builder: new SlashCommandBuilder()
    .setName('${cleanName}')
    .setDescription(${quote(desc)}),${guardsClause}
  async execute(ctx) {
    await ctx.interaction.reply({ content: 'Executed /${cleanName} successfully!' });
  },
});
`;
    }

    case 'event': {
      const rawName = options.name;
      const lower = rawName.toLowerCase();
      const matchedEvent = KNOWN_EVENTS[lower];
      const eventRef = matchedEvent ? `Events.${matchedEvent}` : quote(rawName);
      const onceProp = options.once ? `\n  once: true,` : '';

      return `import { defineEvent } from '@sxnnyside/circe';
import { Events } from 'discord.js';

export default defineEvent({
  name: ${eventRef},${onceProp}
  execute(...args) {
    const ctx = args[args.length - 1];
    ctx.logger?.info(${quote(`Triggered event ${rawName}`)});
  },
});
`;
    }

    case 'component': {
      const pfx =
        options.prefix ?? (options.pattern ? `${options.pattern.split(':')[0]}:` : `${cleanName}:`);

      return `import { defineComponent } from '@sxnnyside/circe';
import { MessageFlags } from 'discord.js';

export default defineComponent({
  prefix: ${quote(pfx)},
  async execute(ctx) {
    await ctx.interaction.reply({
      content: ${quote(`Handled component interaction for ${pfx}`)},
      flags: MessageFlags.Ephemeral,
    });
  },
});
`;
    }

    case 'modal': {
      const pfx = options.prefix ?? `${cleanName}-modal`;

      return `import { defineModal } from '@sxnnyside/circe';
import { MessageFlags } from 'discord.js';

export default defineModal({
  prefix: ${quote(pfx)},
  async execute(ctx) {
    await ctx.interaction.reply({
      content: ${quote(`Received submission for ${pfx}`)},
      flags: MessageFlags.Ephemeral,
    });
  },
});
`;
    }

    case 'guard': {
      const functionName = `${cleanName}Guard`;

      return `import type { Guard } from '@sxnnyside/circe';

/**
 * Access control guard for ${cleanName}.
 */
export function ${functionName}(): Guard {
  return async (_ctx) => {
    // Return true to allow the interaction.
    return true;

    // Or return an explanation string to deny execution:
    // return 'Access denied by ${cleanName} guard.';
  };
}
`;
    }
  }
}

/**
 * Scaffolds a new interaction artifact into the project source tree.
 *
 * @remarks
 * Generates verified boilerplate adhering exactly to `@sxnnyside/circe` conventions:
 * - `command`: under `src/commands/<name>.ts`
 * - `event`: under `src/events/<name>.ts`
 * - `component`: under `src/components/<name>.ts`
 * - `modal`: under `src/modals/<name>.ts`
 * - `guard`: under `src/guards/<name>.ts`
 *
 * Prevents accidental overwrite unless `options.force` is explicitly provided.
 *
 * @param cwd - Target project directory root.
 * @param options - Generation parameters.
 * @returns {@link AddResult} containing the created file path.
 * @throws {@link CirceError} When target file already exists and `force` is false.
 *
 * @example
 * ```ts
 * await runAdd(process.cwd(), {
 *   kind: 'command',
 *   name: 'ping',
 *   description: 'Checks bot latency',
 *   guildOnly: true,
 * });
 * ```
 *
 * @public
 */
export async function runAdd(cwd: string, options: AddOptions): Promise<AddResult> {
  const folderMap: Record<AddArtifactKind, string> = {
    command: path.join('src', 'commands'),
    event: path.join('src', 'events'),
    component: path.join('src', 'components'),
    modal: path.join('src', 'modals'),
    guard: path.join('src', 'guards'),
  };

  const folder = folderMap[options.kind];
  const fileName = `${options.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()}.ts`;
  const relativePath = path.join(folder, fileName);
  const absolutePath = path.join(cwd, relativePath);

  if (existsSync(absolutePath) && !options.force) {
    throw new CirceError(`Cannot add ${options.kind}: '${relativePath}' already exists.`, {
      metadata: { file: absolutePath },
      operational: true,
    });
  }

  const content = generateTemplateContent(options);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');

  return {
    created: true,
    filePath: absolutePath,
    relativePath,
    kind: options.kind,
    name: options.name,
  };
}
