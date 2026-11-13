/**
 * Supported JavaScript execution runtimes.
 *
 * @remarks
 * Circe is designed for native Bun and Deno execution, with Node 22+ supported as an adapter.
 *
 * @public
 */
export type Runtime = 'bun' | 'node' | 'deno';

/**
 * Identifies the active global JavaScript runtime environment ('bun', 'deno', or 'node').
 *
 * @remarks
 * Performs zero-overhead property checks on `globalThis` to detect `Bun` or `Deno` globals.
 * Defaults to `'node'` if neither is present.
 *
 * @example
 * ```ts
 * const runtime = detectRuntime();
 * if (runtime === 'bun') {
 *   // Use Bun native optimisations
 * }
 * ```
 *
 * @returns The detected `Runtime` identifier.
 * @public
 */
export function detectRuntime(): Runtime {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    return 'bun';
  }
  if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
    return 'deno';
  }
  return 'node';
}
