import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface ScaffoldFile {
  readonly relativePath: string;
  readonly content: string;
}

const CONFIG_FILE = "circe.config.ts";

const FILES: readonly ScaffoldFile[] = [
  {
    relativePath: CONFIG_FILE,
    content: `import { GatewayIntentBits } from "discord.js";
import { defineCirceConfig } from "@sxnnyside/circe";
import config from "./src/config.js";

export default defineCirceConfig({
  config,
  intents: [GatewayIntentBits.Guilds],
});
`,
  },
  {
    relativePath: "src/config.ts",
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
    relativePath: "src/commands/ping.ts",
    content: `import { SlashCommandBuilder } from "discord.js";
import { defineCommand } from "@sxnnyside/circe";

export default defineCommand({
  builder: new SlashCommandBuilder().setDescription("Replies with pong."),
  async execute(ctx) {
    await ctx.interaction.reply("pong");
  },
});
`,
  },
  {
    relativePath: ".env.example",
    content: `DISCORD_TOKEN=
`,
  },
  {
    relativePath: ".gitignore",
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
 * `src/config.ts`, one example command, and `.env.example`/`.gitignore`.
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
    await writeFile(absolutePath, file.content, "utf8");
    created.push(file.relativePath);
  }

  return { created, skipped };
}

export function renderInitResult(result: InitResult): string {
  const lines: string[] = [];

  for (const file of result.created) {
    lines.push(`  created  ${file}`);
  }
  for (const file of result.skipped) {
    lines.push(`  skipped  ${file} (already exists)`);
  }

  if (result.created.length > 0) {
    lines.push(
      "",
      "Next steps:",
      "  1. bun install @sxnnyside/circe discord.js zod",
      "  2. cp .env.example .env and fill in DISCORD_TOKEN",
      "  3. bun x circe dev",
    );
  }

  return lines.join("\n");
}
