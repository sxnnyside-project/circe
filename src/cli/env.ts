import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Bun reads `.env` on its own; Node and Deno do not. Loading it here makes the
 * scaffold's "copy .env.example to .env" step work on every runtime. Variables
 * already set in the environment win, so a real deployment is never overridden.
 */
export function loadDotEnv(cwd: string): void {
  const file = path.join(cwd, '.env');
  if (existsSync(file)) {
    process.loadEnvFile?.(file);
  }
}
