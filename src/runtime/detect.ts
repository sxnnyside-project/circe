export type Runtime = 'bun' | 'node' | 'deno';

/** Identifies the active global environment. Used only for adapter selection/logging — never branched on by application code directly. */
export function detectRuntime(): Runtime {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    return 'bun';
  }
  if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
    return 'deno';
  }
  return 'node';
}
