import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfigFile } from '../application/prepare-app.js';
import type { CirceConfigFile } from '../config/circe-config.js';
import type { EnvConfig } from '../config/env-config.js';
import { ConfigError } from '../config/errors.js';
import { detectRuntime } from '../runtime/detect.js';

/**
 * Severity level of a diagnostic item.
 *
 * @public
 */
export type DiagnosticLevel = 'pass' | 'warn' | 'fail';

/**
 * Individual diagnostic check outcome.
 *
 * @public
 */
export interface DiagnosticItem {
  /** Short machine-readable identifier. */
  readonly id: string;
  /** Human-readable category or title. */
  readonly title: string;
  /** Severity level. */
  readonly level: DiagnosticLevel;
  /** Detailed description of the diagnostic finding. */
  readonly message: string;
  /** Optional actionable remediation suggestion. */
  readonly suggestion?: string | undefined;
}

/**
 * Complete diagnostic report from {@link runDoctor}.
 *
 * @public
 */
export interface DoctorResult {
  /** `true` when there are no `'fail'` level diagnostics. */
  readonly ok: boolean;
  /** Introspected runtime environment details. */
  readonly runtime: {
    readonly name: string;
    readonly version: string;
    readonly supported: boolean;
  };
  /** Ordered list of diagnostics performed. */
  readonly diagnostics: readonly DiagnosticItem[];
}

/**
 * Minimum supported versions per runtime environment.
 */
const MIN_VERSIONS = {
  bun: '1.4.0',
  node: '22.18.0',
  deno: '2.0.0',
} as const;

/** Display name and upgrade hint per runtime, next to the version floor in {@link MIN_VERSIONS}. */
const RUNTIME_ENGINES = {
  bun: { label: 'Bun', upgrade: `Upgrade Bun by running 'bun upgrade'.` },
  node: {
    label: 'Node.js',
    upgrade: 'Install Node.js v22.18.0 or later to enable native TypeScript support.',
  },
  deno: { label: 'Deno', upgrade: `Upgrade Deno by running 'deno upgrade'.` },
} as const;

/**
 * Compares two semver strings (a >= b).
 *
 * @internal
 */
export function semverGte(a: string, b: string): boolean {
  const cleanA = a.replace(/^[^0-9]*/, '');
  const cleanB = b.replace(/^[^0-9]*/, '');
  const partsA = cleanA.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const partsB = cleanB.split('.').map((p) => Number.parseInt(p, 10) || 0);

  const majA = partsA[0] ?? 0;
  const majB = partsB[0] ?? 0;
  if (majA !== majB) return majA > majB;

  const minA = partsA[1] ?? 0;
  const minB = partsB[1] ?? 0;
  if (minA !== minB) return minA > minB;

  const patA = partsA[2] ?? 0;
  const patB = partsB[2] ?? 0;
  return patA >= patB;
}

/**
 * Resolves current runtime version string.
 *
 * @internal
 */
function getRuntimeVersion(): string {
  if (typeof process !== 'undefined' && process.versions?.bun) {
    return process.versions.bun;
  }
  const deno = (globalThis as Record<string, unknown>).Deno as
    | { version?: { deno?: string } }
    | undefined;
  if (deno?.version?.deno) {
    return deno.version.deno;
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    return process.versions.node;
  }
  return '0.0.0';
}

function isConfigError(error: unknown): error is ConfigError {
  return (
    error instanceof ConfigError ||
    (typeof error === 'object' &&
      error !== null &&
      Array.isArray((error as { issues?: unknown }).issues) &&
      (Boolean((error as { name?: string }).name?.startsWith('ConfigError')) ||
        Boolean((error as { message?: string }).message?.includes('Invalid configuration'))))
  );
}

/**
 * Inspects a Circe project directory and emits preventive diagnostics.
 *
 * @remarks
 * Validates:
 * 1. Active runtime engine and version floor requirements.
 * 2. Presence and validity of `circe.config.ts`.
 * 3. Environment variables against schema in `src/config.ts`.
 * 4. Discord bot authentication credentials.
 * 5. Type declaration dependencies (`@types/bun`, `@types/node`).
 *
 * @param cwd - Target directory containing the Circe project.
 * @returns Complete {@link DoctorResult} diagnostic report.
 *
 * @example
 * ```ts
 * const result = await runDoctor(process.cwd());
 * if (!result.ok) {
 *   console.error('Environment check failed');
 * }
 * ```
 *
 * @public
 */
export async function runDoctor(cwd: string): Promise<DoctorResult> {
  const diagnostics: DiagnosticItem[] = [];
  const runtimeName = detectRuntime();
  const runtimeVersion = getRuntimeVersion();

  // 1. Runtime engine verification
  const engine = RUNTIME_ENGINES[runtimeName];
  const minVersion = MIN_VERSIONS[runtimeName];
  const runtimeSupported = semverGte(runtimeVersion, minVersion);
  diagnostics.push(
    runtimeSupported
      ? {
          id: 'runtime:engine',
          title: 'Runtime Engine',
          level: 'pass',
          message: `Running on ${engine.label} v${runtimeVersion} (meets minimum v${minVersion}).`,
        }
      : {
          id: 'runtime:engine',
          title: 'Runtime Engine',
          level: 'fail',
          message: `${engine.label} v${runtimeVersion} is below minimum supported version v${minVersion}.`,
          suggestion: engine.upgrade,
        },
  );

  // 2. Configuration file check (circe.config.ts)
  const configPath = path.join(cwd, 'circe.config.ts');
  let loadedConfig: CirceConfigFile | undefined;

  if (!existsSync(configPath)) {
    diagnostics.push({
      id: 'config:file',
      title: 'Configuration File',
      level: 'fail',
      message: `circe.config.ts not found in ${cwd}.`,
      suggestion: `Run 'circe init' to generate a starter configuration.`,
    });
  } else {
    try {
      ({ configFile: loadedConfig } = await loadConfigFile(cwd));
      diagnostics.push({
        id: 'config:file',
        title: 'Configuration File',
        level: 'pass',
        message: `circe.config.ts is valid (transport: ${loadedConfig.transport ?? 'gateway'}).`,
      });

      // `circe start` reads the key from `http.publicKey` only; an environment variable
      // counts when circe.config.ts passes it through.
      if (loadedConfig.transport === 'http' || loadedConfig.transport === 'hybrid') {
        const hasPublicKey = Boolean(loadedConfig.http?.publicKey);
        diagnostics.push({
          id: 'transport:security',
          title: 'HTTP Transport Security',
          level: hasPublicKey ? 'pass' : 'fail',
          message: hasPublicKey
            ? `Ed25519 public key configured for HTTP interaction verification.`
            : `HTTP transport is enabled, but no Ed25519 public key was found.`,
          ...(hasPublicKey
            ? {}
            : {
                suggestion: `Provide 'http: { publicKey: "..." }' in circe.config.ts, e.g. read from DISCORD_PUBLIC_KEY in .env.`,
              }),
        });
      }
    } catch (error) {
      diagnostics.push({
        id: 'config:file',
        title: 'Configuration File',
        level: 'fail',
        message: `Failed to load circe.config.ts: ${error instanceof Error ? error.message : String(error)}`,
        suggestion: `Check circe.config.ts for syntax errors or missing imports.`,
      });
    }
  }

  // 3. Environment schema check (src/config.ts)
  const envConfigPath = path.join(cwd, 'src', 'config.ts');
  if (!existsSync(envConfigPath)) {
    diagnostics.push({
      id: 'env:schema',
      title: 'Environment Schema',
      level: 'warn',
      message: `src/config.ts not found. Environment validation is unconfigured.`,
      suggestion: `Create src/config.ts with defineEnvConfig() for type-safe environment variables.`,
    });
  } else {
    try {
      const imported = (await import(pathToFileURL(envConfigPath).href)) as {
        default?: EnvConfig<Record<string, unknown>>;
      };
      const envConfig = imported.default;
      if (envConfig && typeof envConfig.load === 'function') {
        try {
          envConfig.load(process.env);
          diagnostics.push({
            id: 'env:schema',
            title: 'Environment Schema',
            level: 'pass',
            message: `Environment variables satisfy the schema in src/config.ts.`,
          });
        } catch (error) {
          if (isConfigError(error)) {
            const issues = error.issues.map((i) => `${i.path}: ${i.message}`);
            diagnostics.push({
              id: 'env:schema',
              title: 'Environment Schema',
              level: 'fail',
              message: `Environment variables do not satisfy src/config.ts:\n    - ${issues.join('\n    - ')}`,
              suggestion: `Update your .env file with the missing or invalid variables.`,
            });
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      diagnostics.push({
        id: 'env:schema',
        title: 'Environment Schema',
        level: 'fail',
        message: `Failed to load src/config.ts: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // 4. Discord Bot Credentials check
  // The bot's own schema decides the variable name; `DISCORD_TOKEN` is only the scaffold default.
  let token = process.env.DISCORD_TOKEN;
  try {
    const loaded = loadedConfig?.config.load() as { token?: unknown } | undefined;
    if (typeof loaded?.token === 'string') {
      token = loaded.token;
    }
  } catch {
    // An invalid schema is already reported by the environment check above.
  }
  if (!token) {
    diagnostics.push({
      id: 'auth:token',
      title: 'Discord Bot Token',
      level: 'warn',
      message: `DISCORD_TOKEN is missing from environment.`,
      suggestion: `Obtain a token from Discord Developer Portal and add DISCORD_TOKEN to .env.`,
    });
  } else if (token === 'your-discord-bot-token' || token.length < 20) {
    diagnostics.push({
      id: 'auth:token',
      title: 'Discord Bot Token',
      level: 'warn',
      message: `DISCORD_TOKEN appears to be a placeholder or invalid token.`,
      suggestion: `Replace the placeholder with a real bot token from Discord Developer Portal.`,
    });
  } else {
    diagnostics.push({
      id: 'auth:token',
      title: 'Discord Bot Token',
      level: 'pass',
      message: `DISCORD_TOKEN is set.`,
    });
  }

  // 5. Dependency and Types alignment
  const packageJsonPath = path.join(cwd, 'package.json');
  const denoJsonPath = path.join(cwd, 'deno.json');

  if (existsSync(denoJsonPath)) {
    diagnostics.push({
      id: 'manifest:deno',
      title: 'Deno Configuration',
      level: 'pass',
      message: `deno.json detected (Deno-first setup).`,
    });
  } else if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const devDeps = pkg.devDependencies ?? {};

      if (runtimeName === 'bun' && !devDeps['@types/bun']) {
        diagnostics.push({
          id: 'types:bun',
          title: 'TypeScript Definitions',
          level: 'warn',
          message: `@types/bun is not declared in devDependencies.`,
          suggestion: `Run 'bun add -d @types/bun' for enhanced IDE auto-completion.`,
        });
      } else if (runtimeName === 'node' && !devDeps['@types/node']) {
        diagnostics.push({
          id: 'types:node',
          title: 'TypeScript Definitions',
          level: 'warn',
          message: `@types/node is not declared in devDependencies.`,
          suggestion: `Run 'npm install -D @types/node' for Node.js standard library typings.`,
        });
      } else {
        diagnostics.push({
          id: 'types:alignment',
          title: 'TypeScript Definitions',
          level: 'pass',
          message: `Type definitions are aligned with ${runtimeName}.`,
        });
      }
    } catch {
      // Ignore unparseable package.json in diagnostic
    }
  }

  const ok = diagnostics.every((d) => d.level !== 'fail');

  return {
    ok,
    runtime: {
      name: runtimeName,
      version: runtimeVersion,
      supported: runtimeSupported,
    },
    diagnostics,
  };
}

/**
 * Formats a {@link DoctorResult} for terminal display.
 *
 * @param result - Diagnostic report.
 * @returns Formatted human-readable output string.
 *
 * @public
 */
export function renderDoctorResult(result: DoctorResult): string {
  const lines: string[] = ['Circe Doctor — Pre-flight Environment Inspection', ''];

  const passed = result.diagnostics.filter((d) => d.level === 'pass').length;
  const warnings = result.diagnostics.filter((d) => d.level === 'warn').length;
  const failed = result.diagnostics.filter((d) => d.level === 'fail').length;

  for (const diag of result.diagnostics) {
    let icon = '✓';
    if (diag.level === 'warn') icon = '!';
    if (diag.level === 'fail') icon = '✗';

    lines.push(`  ${icon} [${diag.title}] ${diag.message}`);
    if (diag.suggestion && diag.level !== 'pass') {
      lines.push(`      Recommendation: ${diag.suggestion}`);
    }
  }

  lines.push('');
  lines.push(`Summary: ${passed} passed, ${warnings} warnings, ${failed} failed`);
  if (!result.ok) {
    lines.push(
      'Result: Doctor detected blocking issues. Address the failures above before starting.',
    );
  } else if (warnings > 0) {
    lines.push('Result: All critical checks passed with non-blocking warnings.');
  } else {
    lines.push('Result: System is healthy and ready to run Circe.');
  }

  return lines.join('\n');
}
