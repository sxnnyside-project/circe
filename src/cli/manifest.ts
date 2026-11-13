import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GatewayIntentBits } from 'discord.js';
import { loadConfigFile } from '../application/prepare-app.js';
import type { TransportMode } from '../config/circe-config.js';
import {
  type PrefixHierarchyWarning,
  type RouteInfo,
  type RouteKind,
  runRoutes,
} from './routes.js';
import { readVersion } from './version.js';

/**
 * Project-relative location of the generated manifest.
 *
 * @public
 */
export const MANIFEST_RELATIVE_PATH = '.circe/project.json';

/**
 * Project-relative directory holding official agent skills.
 *
 * @public
 */
export const SKILLS_RELATIVE_PATH = '.agents/skills';

const DEFAULT_HTTP_PORT = 8787;
const MIDDLEWARE_FILE_NAME = 'middleware.ts';
const ERROR_BOUNDARY_FILE_NAME = 'error.ts';

/**
 * Declarative, secret-free summary of a bot's state and capabilities.
 *
 * @remarks
 * Written to `.circe/project.json` by `circe manifest` so coding agents can understand a project
 * by reading one file instead of crawling the source tree. The document is deterministic —
 * no timestamps, absolute paths, or environment-dependent values — so it diffs cleanly in
 * review and `circe manifest --check` can verify it in CI.
 *
 * Credentials (`token`, `http.publicKey`) are never included.
 *
 * @public
 */
export interface ProjectManifest {
  /** Manifest format revision. Incremented only on breaking structural changes. */
  readonly schemaVersion: 1;
  /** Tool that produced the document. */
  readonly generator: {
    readonly name: '@sxnnyside/circe';
    readonly version: string;
  };
  /** Settings resolved from `circe.config.ts`. */
  readonly project: {
    /** Active transport mode. */
    readonly transport: TransportMode;
    /** Scan root relative to the project directory, with forward slashes. */
    readonly scanRoot: string;
    /** Names of the enabled Gateway intents, sorted alphabetically. */
    readonly intents: readonly string[];
    /** Interactions server settings for `http` and `hybrid`; `null` for `gateway`. */
    readonly http: { readonly port: number } | null;
    /** Whether `/health` and `/ready` probes are configured. */
    readonly health: boolean;
    /** Names of the registered integrations, in declaration order. */
    readonly integrations: readonly string[];
  };
  /** Optional single-file conventions and agent skills detected on disk. */
  readonly conventions: {
    /** Whether `middleware.ts` exists at the scan root. */
    readonly middleware: boolean;
    /** Whether `error.ts` exists at the scan root. */
    readonly errorBoundary: boolean;
    /** Localization convention file in use, preferring `localization.ts` over legacy `i18n.ts`. */
    readonly localization: 'localization.ts' | 'i18n.ts' | null;
    /** Names of the skills under `.agents/skills/`, sorted alphabetically. */
    readonly skills: readonly string[];
  };
  /** Number of discovered routes per {@link RouteKind}; kinds with no routes are omitted. */
  readonly capabilities: Readonly<Partial<Record<RouteKind, number>>>;
  /** Every discovered interaction route, sorted by kind then name. */
  readonly routes: readonly RouteInfo[];
  /** Component prefix overlaps resolved by longest-prefix matching. */
  readonly prefixHierarchies: readonly PrefixHierarchyWarning[];
}

/**
 * Operating mode for {@link runManifest}.
 *
 * @remarks
 * - `write`: Generate the manifest and write it when its content changed.
 * - `check`: Compare the on-disk manifest with a freshly generated one without writing.
 *
 * @public
 */
export type ManifestMode = 'write' | 'check';

/**
 * Outcome of a manifest operation.
 *
 * @remarks
 * - `written`: The file was created or updated.
 * - `up-to-date`: The file already matches the project.
 * - `stale`: (`check` only) The file exists but no longer matches the project.
 * - `missing`: (`check` only) The file does not exist.
 *
 * @public
 */
export type ManifestStatus = 'written' | 'up-to-date' | 'stale' | 'missing';

/**
 * Result returned by {@link runManifest}.
 *
 * @public
 */
export interface ManifestResult {
  /** `true` unless a `check` found the manifest `stale` or `missing`. */
  readonly ok: boolean;
  /** What happened to the manifest file. */
  readonly status: ManifestStatus;
  /** Manifest location relative to the project directory. */
  readonly path: string;
  /** The freshly generated manifest. */
  readonly manifest: ProjectManifest;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

async function listSkills(cwd: string): Promise<string[]> {
  const skillsDir = path.join(cwd, SKILLS_RELATIVE_PATH);
  if (!existsSync(skillsDir)) return [];
  const entries = await readdir(skillsDir, { withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isDirectory() && existsSync(path.join(skillsDir, entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Builds the {@link ProjectManifest} for the project in `cwd`.
 *
 * @remarks
 * Loads `circe.config.ts` and runs the same IoC discovery as `circe routes`. Does not connect to
 * Discord, but — like `build` and `routes` — requires the environment variables declared in the
 * project's configuration schema.
 *
 * @param cwd - Project root containing `circe.config.ts`.
 * @returns The deterministic manifest.
 * @throws {@link ConfigFileNotFoundError} When `circe.config.ts` is missing.
 * @throws {@link ModuleValidationError} When any module violates its contract.
 *
 * @example
 * ```typescript
 * const manifest = await buildManifest(process.cwd());
 * console.log(manifest.capabilities);
 * ```
 *
 * @public
 */
export async function buildManifest(cwd: string): Promise<ProjectManifest> {
  const { configFile } = await loadConfigFile(cwd);
  const report = await runRoutes(cwd);

  const scanRoot = path.resolve(cwd, configFile.scanRoot ?? './src');
  const transport = configFile.transport ?? 'gateway';

  const capabilities: Partial<Record<RouteKind, number>> = {};
  for (const route of report.routes) {
    capabilities[route.kind] = (capabilities[route.kind] ?? 0) + 1;
  }

  const intents = (configFile.intents as readonly number[])
    .map((intent) => GatewayIntentBits[intent] ?? String(intent))
    .sort();

  const localization = existsSync(path.join(scanRoot, 'localization.ts'))
    ? 'localization.ts'
    : existsSync(path.join(scanRoot, 'i18n.ts'))
      ? 'i18n.ts'
      : null;

  return {
    schemaVersion: 1,
    generator: { name: '@sxnnyside/circe', version: readVersion() },
    project: {
      transport,
      scanRoot: toPosix(path.relative(cwd, scanRoot)) || '.',
      intents,
      http: transport === 'gateway' ? null : { port: configFile.http?.port ?? DEFAULT_HTTP_PORT },
      health: configFile.health !== undefined,
      integrations: (configFile.integrations ?? []).map((integration) => integration.name),
    },
    conventions: {
      middleware: existsSync(path.join(scanRoot, MIDDLEWARE_FILE_NAME)),
      errorBoundary: existsSync(path.join(scanRoot, ERROR_BOUNDARY_FILE_NAME)),
      localization,
      skills: await listSkills(cwd),
    },
    capabilities,
    routes: report.routes,
    prefixHierarchies: report.prefixHierarchies,
  };
}

/**
 * Serializes a {@link ProjectManifest} exactly as it is stored on disk.
 *
 * @param manifest - The manifest to serialize.
 * @returns Two-space indented JSON terminated by a newline.
 *
 * @public
 */
export function renderManifest(manifest: ProjectManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Generates, writes, or verifies `.circe/project.json` for the project in `cwd`.
 *
 * @remarks
 * **Process Semantics:**
 * - `write` creates `.circe/` when needed and rewrites the file only when its content changed,
 *   so unchanged projects produce no filesystem churn.
 * - `check` never writes: it reports `stale` or `missing`, letting CI fail when the manifest
 *   was not regenerated alongside a code change.
 * - Zero Discord connection; requires the project's declared environment variables.
 *
 * @param cwd - Project root containing `circe.config.ts`.
 * @param mode - Whether to write or only check.
 * @returns A {@link ManifestResult} describing the outcome.
 *
 * @example
 * ```typescript
 * const result = await runManifest(process.cwd(), 'check');
 * if (!result.ok) process.exitCode = 1;
 * ```
 *
 * @public
 */
export async function runManifest(
  cwd: string,
  mode: ManifestMode = 'write',
): Promise<ManifestResult> {
  const manifest = await buildManifest(cwd);
  const rendered = renderManifest(manifest);
  const filePath = path.join(cwd, MANIFEST_RELATIVE_PATH);
  const existing = existsSync(filePath) ? await readFile(filePath, 'utf8') : undefined;

  if (mode === 'check') {
    const status: ManifestStatus =
      existing === undefined ? 'missing' : existing === rendered ? 'up-to-date' : 'stale';
    return { ok: status === 'up-to-date', status, path: MANIFEST_RELATIVE_PATH, manifest };
  }

  if (existing === rendered) {
    return { ok: true, status: 'up-to-date', path: MANIFEST_RELATIVE_PATH, manifest };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, rendered, 'utf8');
  return { ok: true, status: 'written', path: MANIFEST_RELATIVE_PATH, manifest };
}
