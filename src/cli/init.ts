import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { detectRuntime } from '../runtime/detect.js';

/**
 * Supported target runtimes for project scaffolding.
 *
 * @public
 */
export type Runtime = 'bun' | 'deno' | 'node';

/**
 * Starter template complexity tiers.
 *
 * @remarks
 * - `minimal`: Single ping command and typed config.
 * - `standard`: Commands, help embed, components, ready event, error boundary, and i18n resolver.
 * - `advanced`: Command groups, context menus, modals, pagination, Dockerfile, and observability.
 *
 * @public
 */
export type TemplateTier = 'minimal' | 'standard' | 'advanced';

/**
 * Options passed to {@link runInit} to configure project generation.
 *
 * @public
 */
export interface InitOptions {
  /**
   * Target runtime for the scaffolded project.
   * Auto-detected from the active process or environment when omitted.
   *
   * @defaultValue Auto-detected (`bun`, `deno`, or `node`)
   */
  readonly runtime?: Runtime | undefined;

  /**
   * Complexity tier of the starter template.
   *
   * @defaultValue `'minimal'`
   */
  readonly template?: TemplateTier | undefined;
}

/**
 * Scaffolding summary indicating which files were created and which were skipped.
 *
 * @public
 */
export interface InitResult {
  /** Relative paths of files successfully created. */
  readonly created: readonly string[];
  /** Relative paths of files skipped because they already existed. */
  readonly skipped: readonly string[];
  /** Runtime target used during scaffolding. */
  readonly runtime: Runtime;
  /** Template tier used during scaffolding. */
  readonly template: TemplateTier;
}

/**
 * Supported package managers detected from the environment.
 *
 * @public
 */
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

/**
 * Detects the package manager that launched this process from `npm_config_user_agent`.
 *
 * @param userAgent - The raw `process.env.npm_config_user_agent` string.
 * @returns Detected {@link PackageManager}, defaulting to `'npm'` if unrecognized.
 *
 * @public
 */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split('/')[0];
  return name === 'bun' || name === 'pnpm' || name === 'yarn' ? name : 'npm';
}

/**
 * Determines default target runtime based on active process and environment indicators.
 *
 * @returns Best matching {@link Runtime}.
 *
 * @public
 */
export function detectDefaultRuntime(): Runtime {
  const rt = detectRuntime();
  if (rt === 'bun') return 'bun';
  if (rt === 'deno') return 'deno';
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent?.startsWith('bun')) return 'bun';
  return 'node';
}

/**
 * Resolves the root directory containing starter templates.
 *
 * @internal
 */
function resolveTemplatesDir(): string {
  const candidate = path.resolve(import.meta.dirname, '../../templates');
  if (existsSync(candidate)) return candidate;
  return path.resolve(process.cwd(), 'templates');
}

/**
 * Recursively collects file entries from a directory.
 *
 * @internal
 */
async function collectFiles(
  dir: string,
  base = '',
): Promise<{ relativePath: string; absolutePath: string }[]> {
  const fullDir = base ? path.join(dir, base) : dir;
  if (!existsSync(fullDir)) return [];
  const entries = await readdir(fullDir, { withFileTypes: true });
  const files: { relativePath: string; absolutePath: string }[] = [];

  for (const entry of entries) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    const abs = path.join(dir, rel);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(dir, rel)));
    } else if (entry.isFile()) {
      files.push({ relativePath: rel, absolutePath: abs });
    }
  }

  return files;
}

/**
 * Scaffolds a new Circe project in `targetDir` from template files.
 *
 * @remarks
 * Uses a DRY layered template architecture:
 * 1. Tier-independent files from `templates/shared/` (official agent skills under `.agents/skills/`)
 * 2. Base files from `templates/common/<tier>/` (commands, config, events, etc.)
 * 3. Runtime overlay from `templates/<runtime>/<tier>/` (package.json / deno.json, tsconfig, Dockerfile, README)
 *
 * Later layers win when two layers provide the same path.
 *
 * Files are never overwritten — if a file already exists at the target path,
 * it is recorded in `skipped` and left untouched.
 *
 * @param targetDir - Destination folder to scaffold into.
 * @param options - Generation options specifying runtime and template tier.
 * @returns A summary object with created and skipped paths.
 *
 * @example
 * ```ts
 * const result = await runInit('./my-bot', { runtime: 'deno', template: 'standard' });
 * console.log(`Created ${result.created.length} files for ${result.runtime}`);
 * ```
 *
 * @public
 */
export async function runInit(targetDir: string, options: InitOptions = {}): Promise<InitResult> {
  const runtime = options.runtime ?? detectDefaultRuntime();
  const template = options.template ?? 'minimal';
  const templatesDir = resolveTemplatesDir();

  const layers = [
    path.join(templatesDir, 'shared'),
    path.join(templatesDir, 'common', template),
    path.join(templatesDir, runtime, template),
  ];

  const fileMap = new Map<string, string>();
  for (const layer of layers) {
    for (const file of await collectFiles(layer)) {
      fileMap.set(file.relativePath, file.absolutePath);
    }
  }

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [relativePath, sourcePath] of fileMap) {
    const destinationPath = path.join(targetDir, relativePath);

    if (existsSync(destinationPath)) {
      skipped.push(relativePath);
      continue;
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    created.push(relativePath);
  }

  return {
    created: created.sort(),
    skipped: skipped.sort(),
    runtime,
    template,
  };
}

const COMMANDS: Record<PackageManager, { add: string; run: string; install: string }> = {
  bun: {
    add: 'bun add @sxnnyside/circe discord.js zod',
    run: 'bun x circe dev',
    install: 'bun install',
  },
  npm: {
    add: 'npm install @sxnnyside/circe discord.js zod',
    run: 'npx circe dev',
    install: 'npm install',
  },
  pnpm: {
    add: 'pnpm add @sxnnyside/circe discord.js zod',
    run: 'pnpm exec circe dev',
    install: 'pnpm install',
  },
  yarn: {
    add: 'yarn add @sxnnyside/circe discord.js zod',
    run: 'yarn circe dev',
    install: 'yarn install',
  },
};

/**
 * Formats the initialization result for human-readable terminal output.
 *
 * @param result - Output from {@link runInit}.
 * @param packageManager - Package manager to recommend in instructions.
 * @returns Multi-line formatted terminal output string.
 *
 * @public
 */
export function renderInitResult(
  result: InitResult | { readonly created: readonly string[]; readonly skipped: readonly string[] },
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
    const isDeno = 'runtime' in result && result.runtime === 'deno';
    lines.push('', 'Next steps:');
    if (isDeno) {
      lines.push('  1. cp .env.example .env and fill in DISCORD_TOKEN', '  2. deno task dev');
    } else {
      const pm = COMMANDS[packageManager] ?? COMMANDS.npm;
      const hasPackageJson = result.created.includes('package.json');
      if (hasPackageJson) {
        lines.push(`  1. ${pm.install}`);
      } else {
        lines.push(`  1. ${pm.add}`);
      }
      lines.push('  2. cp .env.example .env and fill in DISCORD_TOKEN');
      lines.push(`  3. ${pm.run}`);
    }
  }

  return lines.join('\n');
}
