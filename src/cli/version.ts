import { readFileSync } from 'node:fs';

/**
 * Resolves the semver version string of Circe from `package.json`.
 *
 * @remarks
 * Safely resolves the package root across both development sources (`src/cli/`)
 * and bundled production distributions (`dist/cli/`) using `import.meta.url`.
 *
 * @returns The semantic version string (e.g. `1.2.0`).
 *
 * @internal
 */
export function readVersion(): string {
  const manifest = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
}

/**
 * Executes the `version` command, printing standard version banner to stdout.
 *
 * @remarks
 * **Process Semantics:**
 * - Adheres to Sxnnyside CLI contract: writes exactly `circe X.Y.Z\n` to `process.stdout`.
 * - Zero network access, zero filesystem mutation.
 *
 * @internal
 */
export function runVersion(): void {
  process.stdout.write(`circe ${readVersion()}\n`);
}
