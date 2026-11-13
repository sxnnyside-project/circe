import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads environment variables from a `.env` file into `process.env`.
 *
 * @remarks
 * While Bun automatically loads `.env` files into environment variables at startup,
 * Node.js (via `process.loadEnvFile`) and Deno require explicit loading.
 *
 * This function ensures runtime parity across Node.js, Bun, and Deno by invoking
 * the native `process.loadEnvFile` API if present and if a `.env` file exists at the
 * specified directory.
 *
 * Pre-existing environment variables are never overwritten, adhering to 12-factor
 * configuration standards (real production environment variables always win over file defaults).
 *
 * @param cwd - The absolute or relative project directory where `.env` is expected.
 *
 * @example
 * ```typescript
 * import { loadDotEnv } from './dotenv.js';
 * loadDotEnv(process.cwd());
 * ```
 *
 * @public
 */
export function loadDotEnv(cwd: string): void {
  const file = path.join(cwd, '.env');
  if (existsSync(file)) {
    process.loadEnvFile?.(file);
  }
}
