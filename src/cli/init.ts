import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface ScaffoldFile {
  readonly relativePath: string;
  readonly content: string;
}

const CONFIG_FILE = 'circe.config.ts';

const FILES: readonly ScaffoldFile[] = [
  {
    relativePath: CONFIG_FILE,
    content: `import { GatewayIntentBits } from "discord.js";
import { defineCirceConfig } from "@sxnnyside/circe";
import config from "./src/config.ts";

export default defineCirceConfig({
  config,
  intents: [GatewayIntentBits.Guilds],
});
`,
  },
  {
    relativePath: 'src/config.ts',
    content: `import { z } from "zod";
import { defineConfig } from "@sxnnyside/circe";

export default defineConfig(
  z.object({
    DISCORD_TOKEN: z.string(),
  }),
);
`,
  },
  {
    relativePath: 'src/commands/ping.ts',
    content: `import { SlashCommandBuilder } from "discord.js";
import { defineCommand } from "@sxnnyside/circe";

export default defineCommand({
  builder: new SlashCommandBuilder().setName("ping").setDescription("Replies with pong."),
  async execute(ctx) {
    await ctx.interaction.reply("pong");
  },
});
`,
  },
  {
    // `.ts` import specifiers are what Node and Deno resolve without a build step.
    relativePath: 'tsconfig.json',
    content: `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          skipLibCheck: true,
        },
        include: ['circe.config.ts', 'src'],
      },
      null,
      2,
    )}\n`,
  },
  {
    relativePath: '.env.example',
    content: `DISCORD_TOKEN=
`,
  },
  {
    relativePath: '.gitignore',
    content: `node_modules/
dist/
.env
`,
  },
];

export interface InitResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * Scaffolds a new Circe project in `cwd`: `circe.config.ts`, a typed
 * `src/config.ts`, one example command, `tsconfig.json`, and `.env.example`/`.gitignore`.
 * Never overwrites a file that's already there — a file existing is treated
 * as "the developer already made a decision here," same principle as
 * `prepareApp` never guessing at a missing `circe.config.ts` instead of
 * failing loudly. Each skip is reported, not silently dropped, so a
 * half-scaffolded project from a previous run doesn't leave the developer
 * guessing what happened.
 */
export async function runInit(cwd: string): Promise<InitResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const file of FILES) {
    const absolutePath = path.join(cwd, file.relativePath);

    if (existsSync(absolutePath)) {
      skipped.push(file.relativePath);
      continue;
    }

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, 'utf8');
    created.push(file.relativePath);
  }

  return { created, skipped };
}

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

const COMMANDS: Record<PackageManager, { add: string; run: string }> = {
  bun: { add: 'bun add', run: 'bun x circe' },
  npm: { add: 'npm install', run: 'npx circe' },
  pnpm: { add: 'pnpm add', run: 'pnpm exec circe' },
  yarn: { add: 'yarn add', run: 'yarn circe' },
};

/** The manager that launched this process, from the `npm_config_user_agent` every one of them sets; npm when unknown. */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split('/')[0];
  return name === 'bun' || name === 'pnpm' || name === 'yarn' ? name : 'npm';
}

export function renderInitResult(
  result: InitResult,
  packageManager: PackageManager = detectPackageManager(process.env.npm_config_user_agent),
): string {
  const lines: string[] = [];

  for (const file of result.created) {
    lines.push(`  created  ${file}`);
  }
  for (const file of result.skipped) {
    lines.push(`  skipped  ${file} (already exists)`);
  }

  if (result.created.length > 0) {
    lines.push(
      '',
      'Next steps:',
      `  1. ${COMMANDS[packageManager].add} @sxnnyside/circe discord.js zod`,
      '  2. cp .env.example .env and fill in DISCORD_TOKEN',
      `  3. ${COMMANDS[packageManager].run} dev`,
    );
  }

  return lines.join('\n');
}
