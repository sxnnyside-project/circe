#!/usr/bin/env node
import path from 'node:path';
import { loadDotEnv } from '../config/dotenv.js';
import type { CirceError } from '../errors/circe-error.js';
import { normalizeError } from '../errors/normalize-error.js';
import {
  exitCodeFor,
  renderError,
  renderErrorJson,
  renderUsageErrorJson,
} from '../errors/render-error.js';
import { runAdd } from './add.js';
import { runBuild } from './build.js';
import { isShell, runCompletions, SHELLS } from './completions.js';
import { runDev } from './dev.js';
import { renderDoctorResult, runDoctor } from './doctor.js';
import { runHelp } from './help.js';
import { renderInitResult, runInit } from './init.js';
import { runManifest } from './manifest.js';
import { renderRoutesReport, runRoutes } from './routes.js';
import { runStart } from './start.js';
import { runVersion } from './version.js';

/**
 * Complete list of registered CLI command verbs supported by Circe.
 *
 * @internal
 */
export const COMMANDS = [
  'init',
  'start',
  'dev',
  'build',
  'doctor',
  'routes',
  'manifest',
  'add',
  'completions',
  'version',
  'help',
] as const;

/**
 * Union of supported CLI command names.
 *
 * @internal
 */
export type CommandName = (typeof COMMANDS)[number];

/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns The minimum number of single-character edits.
 *
 * @internal
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let previousRow = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    const currentRow = [i];
    const charA = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const charB = b[j - 1];
      const cost = charA === charB ? 0 : 1;
      const prevSameCol = previousRow[j] ?? 0;
      const currPrevCol = currentRow[j - 1] ?? 0;
      const prevPrevCol = previousRow[j - 1] ?? 0;
      currentRow.push(Math.min(prevSameCol + 1, currPrevCol + 1, prevPrevCol + cost));
    }
    previousRow = currentRow;
  }
  return previousRow[n] ?? 0;
}

/**
 * Finds the closest candidate string to `input` if within edit tolerance.
 *
 * @param input - The unrecognized user input.
 * @param candidates - Pool of valid candidate identifiers.
 * @returns The suggested string if within threshold `<= 2`, otherwise `undefined`.
 *
 * @internal
 */
export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
  let closest: string | undefined;
  let minDistance = 3;
  for (const candidate of candidates) {
    const dist = levenshteinDistance(input.toLowerCase(), candidate.toLowerCase());
    if (dist < minDistance) {
      minDistance = dist;
      closest = candidate;
    }
  }
  return closest;
}

/**
 * Parsed CLI command-line arguments representation.
 *
 * @internal
 */
export type ParsedArgs =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'completions'; readonly shell: string | undefined; readonly json: boolean }
  | {
      readonly kind: 'run';
      readonly command: string | undefined;
      readonly json: boolean;
      /** Unrecognized `--format` value, reported as a usage error by the dispatcher. */
      readonly invalidFormat?: string | undefined;
      /** `circe manifest --check`: verify instead of write. */
      readonly manifestCheck?: boolean | undefined;
      readonly targetDir?: string | undefined;
      readonly runtime?: 'bun' | 'deno' | 'node' | undefined;
      readonly template?: 'minimal' | 'standard' | 'advanced' | undefined;
      readonly addArtifact?: 'command' | 'event' | 'component' | 'modal' | 'guard' | undefined;
      readonly addName?: string | undefined;
      readonly addDescription?: string | undefined;
      readonly addGuildOnly?: boolean | undefined;
      readonly addOnce?: boolean | undefined;
      readonly addPrefix?: string | undefined;
      readonly addPattern?: string | undefined;
      readonly addForce?: boolean | undefined;
    };

/**
 * Flags that consume the following token as their value.
 *
 * @internal
 */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--runtime',
  '-r',
  '--template',
  '-t',
  '--description',
  '--prefix',
  '--pattern',
  '--format',
]);

/**
 * Reads the value of the option at `args[index]`, as `--name value` or `--name=value`.
 *
 * @remarks
 * A following token that starts with `-` is the next flag, not a value:
 * `add command ping --description --guild-only` must not use `--guild-only` as the description.
 *
 * @param args - Raw argument tokens.
 * @param index - Position of the candidate option token.
 * @param names - Every spelling of the option, e.g. `['--runtime', '-r']`.
 * @returns The value, or `undefined` when the token is not this option or has no value.
 *
 * @internal
 */
function optionValue(
  args: readonly string[],
  index: number,
  names: readonly string[],
): string | undefined {
  const arg = args[index];
  if (arg === undefined) return undefined;
  if (names.includes(arg)) {
    const next = args[index + 1];
    return next !== undefined && !next.startsWith('-') ? next : undefined;
  }
  const spelling = names.find((name) => arg.startsWith(`${name}=`));
  return spelling === undefined ? undefined : arg.slice(spelling.length + 1);
}

/**
 * Extracts positional arguments, skipping the values consumed by value-taking flags.
 *
 * @remarks
 * `init --runtime deno` must yield `['init']`, not `['init', 'deno']`; otherwise the flag value
 * would be mistaken for the target directory.
 *
 * @param args - Raw argument tokens.
 * @returns Tokens that are neither flags nor flag values.
 *
 * @internal
 */
function positionalsOf(args: readonly string[]): string[] {
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (VALUE_FLAGS.has(arg)) {
      if (optionValue(args, i, [arg]) !== undefined) {
        i++;
      }
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }
  return positionals;
}

/**
 * Reads the `--format <text|json>` / `--format=<text|json>` option.
 *
 * @param args - Raw argument tokens.
 * @returns The recognized format, or the unrecognized raw value in `invalidFormat`.
 *
 * @internal
 */
function readFormat(args: readonly string[]): {
  format: 'text' | 'json' | undefined;
  invalidFormat: string | undefined;
} {
  let raw: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--format') raw = args[i + 1] ?? '';
    else if (arg.startsWith('--format=')) raw = arg.slice('--format='.length);
  }
  if (raw === undefined) return { format: undefined, invalidFormat: undefined };
  const value = raw.toLowerCase();
  if (value === 'json' || value === 'text') return { format: value, invalidFormat: undefined };
  return { format: undefined, invalidFormat: raw };
}

/**
 * Reports whether the raw arguments request machine-readable output.
 *
 * @remarks
 * Used by the top-level failure handler, which runs before (or instead of) full argument parsing.
 *
 * @param args - Raw argument tokens.
 * @returns `true` for `--json`, `--format json`, or `--format=json`.
 *
 * @internal
 */
export function wantsJson(args: readonly string[]): boolean {
  return args.includes('--json') || readFormat(args).format === 'json';
}

/**
 * Parses raw command-line arguments into structured {@link ParsedArgs}.
 *
 * @remarks
 * **Precedence Rules:**
 * - `--help` (`-h`) and `--version` (`-V`) always take precedence over command verbs,
 *   guaranteeing that informational queries never mutate disk or trigger logins.
 * - Global flags (such as `--json`) may appear anywhere before or after positionals.
 *
 * @param args - Array of command-line argument tokens (typically `process.argv.slice(2)`).
 * @returns Structured representation of user intent.
 *
 * @internal
 */
export function parseArgs(args: readonly string[]): ParsedArgs {
  if (args.includes('-h') || args.includes('--help')) return { kind: 'help' };
  if (args.includes('-V') || args.includes('--version')) return { kind: 'version' };

  const { format, invalidFormat } = readFormat(args);
  const json = args.includes('--json') || format === 'json';
  const positionals = positionalsOf(args);
  const command = positionals[0];

  if (command === 'help') return { kind: 'help' };
  if (command === 'version') return { kind: 'version' };
  if (command === 'completions') return { kind: 'completions', shell: positionals[1], json };

  let runtime: 'bun' | 'deno' | 'node' | undefined;
  let template: 'minimal' | 'standard' | 'advanced' | undefined;
  let addDescription: string | undefined;
  let addGuildOnly: boolean | undefined;
  let addOnce: boolean | undefined;
  let addPrefix: string | undefined;
  let addPattern: string | undefined;
  let addForce: boolean | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const runtimeValue = optionValue(args, i, ['--runtime', '-r'])?.toLowerCase();
    if (runtimeValue === 'bun' || runtimeValue === 'deno' || runtimeValue === 'node') {
      runtime = runtimeValue;
    }

    const templateValue = optionValue(args, i, ['--template', '-t'])?.toLowerCase();
    if (
      templateValue === 'minimal' ||
      templateValue === 'standard' ||
      templateValue === 'advanced'
    ) {
      template = templateValue;
    }

    if (arg === '--minimal') template = 'minimal';
    if (arg === '--standard') template = 'standard';
    if (arg === '--advanced') template = 'advanced';

    addDescription = optionValue(args, i, ['--description']) ?? addDescription;
    if (arg === '--guild-only') addGuildOnly = true;
    if (arg === '--once') addOnce = true;
    addPrefix = optionValue(args, i, ['--prefix']) ?? addPrefix;
    addPattern = optionValue(args, i, ['--pattern']) ?? addPattern;
    if (arg === '--force') addForce = true;
  }

  let addArtifact: 'command' | 'event' | 'component' | 'modal' | 'guard' | undefined;
  let addName: string | undefined;
  if (command === 'add') {
    const rawKind = positionals[1]?.toLowerCase();
    if (
      rawKind === 'command' ||
      rawKind === 'event' ||
      rawKind === 'component' ||
      rawKind === 'modal' ||
      rawKind === 'guard'
    ) {
      addArtifact = rawKind;
    }
    addName = positionals[2];
  }

  return {
    kind: 'run',
    command,
    json,
    invalidFormat,
    manifestCheck: command === 'manifest' && args.includes('--check') ? true : undefined,
    targetDir: command === 'init' ? positionals[1] : undefined,
    runtime,
    template,
    addArtifact,
    addName,
    addDescription,
    addGuildOnly,
    addOnce,
    addPrefix,
    addPattern,
    addForce,
  };
}

/**
 * Writes a formatted usage error to stderr and sets process exit code to `2`.
 *
 * @param message - Main diagnostic error message.
 * @param suggestion - Optional "Did you mean ...?" hint.
 * @param json - Emit a structured usage error on stdout instead of plain text on stderr.
 *
 * @internal
 */
function usageError(message: string, suggestion?: string, json = false): void {
  if (json) {
    process.stdout.write(`${renderUsageErrorJson(message, suggestion)}\n`);
  } else {
    const hint = suggestion ? `\nDid you mean '${suggestion}'?` : '';
    process.stderr.write(`error: ${message}${hint}\nRun 'circe --help' for usage.\n`);
  }
  process.exitCode = 2;
}

/**
 * Writes a failure to the stream matching the requested format and sets the exit code.
 *
 * @remarks
 * Text mode writes the human `✗` block to stderr; JSON mode writes one structured error
 * document to stdout so agents read a single stream.
 *
 * @param error - The normalized failure.
 * @param json - Whether structured output was requested.
 *
 * @internal
 */
function reportFailure(error: CirceError, json: boolean): void {
  if (json) {
    process.stdout.write(`${renderErrorJson(error)}\n`);
  } else {
    process.stderr.write(`${renderError(error)}\n`);
  }
  process.exitCode = exitCodeFor(error);
}

/**
 * Main command-line dispatcher function.
 *
 * @remarks
 * Orchestrates CLI lifecycle: parses arguments, loads `.env` for command execution,
 * dispatches to the appropriate command handler, and maps unhandled errors to standard
 * process exit codes.
 *
 * @param argv - Command-line argument vector.
 *
 * @internal
 */
export async function main(argv: readonly string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.kind === 'run' && parsed.invalidFormat !== undefined) {
    usageError(`unknown format: '${parsed.invalidFormat}'. Use 'text' or 'json'.`);
    return;
  }

  switch (parsed.kind) {
    case 'help':
      runHelp();
      break;
    case 'version':
      runVersion();
      break;
    case 'completions':
      if (isShell(parsed.shell)) {
        runCompletions(parsed.shell, COMMANDS);
      } else {
        usageError(`completions requires a shell: ${SHELLS.join(', ')}`, undefined, parsed.json);
      }
      break;
    case 'run':
      loadDotEnv(process.cwd());
      switch (parsed.command) {
        case 'start':
          await runStart(process.cwd());
          break;
        case 'dev':
          await runDev(process.cwd());
          break;
        case 'build':
          await runBuild(process.cwd(), { json: parsed.json });
          break;
        case 'doctor': {
          const result = await runDoctor(process.cwd());
          process.stdout.write(
            `${parsed.json ? JSON.stringify(result, null, 2) : renderDoctorResult(result)}\n`,
          );
          if (!result.ok) {
            process.exitCode = 1;
          }
          break;
        }
        case 'routes': {
          try {
            const report = await runRoutes(process.cwd());
            process.stdout.write(
              `${parsed.json ? JSON.stringify(report, null, 2) : renderRoutesReport(report)}\n`,
            );
          } catch (error) {
            reportFailure(normalizeError(error), parsed.json);
          }
          break;
        }
        case 'manifest': {
          try {
            const result = await runManifest(
              process.cwd(),
              parsed.manifestCheck ? 'check' : 'write',
            );
            if (parsed.json) {
              process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            } else if (result.ok) {
              process.stdout.write(`  ${result.status}  ${result.path}\n`);
            } else {
              process.stderr.write(
                `✗ ${result.path} is ${result.status}\n  Run 'circe manifest' to regenerate it.\n`,
              );
            }
            if (!result.ok) {
              process.exitCode = 1;
            }
          } catch (error) {
            reportFailure(normalizeError(error), parsed.json);
          }
          break;
        }
        case 'add': {
          if (!parsed.addArtifact) {
            usageError(
              `add requires an artifact kind: 'command', 'event', 'component', 'modal', or 'guard'`,
              undefined,
              parsed.json,
            );
            break;
          }
          if (!parsed.addName) {
            usageError(
              `add requires a name (e.g. 'circe add command ping')`,
              undefined,
              parsed.json,
            );
            break;
          }

          try {
            const result = await runAdd(process.cwd(), {
              kind: parsed.addArtifact,
              name: parsed.addName,
              description: parsed.addDescription,
              guildOnly: parsed.addGuildOnly,
              once: parsed.addOnce,
              prefix: parsed.addPrefix,
              pattern: parsed.addPattern,
              force: parsed.addForce,
            });

            if (parsed.json) {
              process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            } else {
              process.stdout.write(`  created  ${result.relativePath}\n`);
            }
          } catch (error) {
            reportFailure(normalizeError(error), parsed.json);
          }
          break;
        }
        case 'init': {
          const targetDir = parsed.targetDir
            ? path.resolve(process.cwd(), parsed.targetDir)
            : process.cwd();
          const result = await runInit(targetDir, {
            runtime: parsed.runtime,
            template: parsed.template,
          });
          process.stdout.write(
            `${parsed.json ? JSON.stringify(result) : renderInitResult(result)}\n`,
          );
          break;
        }
        default: {
          const raw = parsed.command ?? '(none)';
          const suggestion = parsed.command ? didYouMean(parsed.command, COMMANDS) : undefined;
          usageError(`unknown command: ${raw}`, suggestion, parsed.json);
          break;
        }
      }
  }
}

const isDirectExecution =
  Boolean((import.meta as { main?: boolean }).main) ||
  (typeof process !== 'undefined' &&
    typeof process.argv[1] === 'string' &&
    (process.argv[1].endsWith('cli/index.js') ||
      process.argv[1].endsWith('cli/index.ts') ||
      process.argv[1].endsWith('/circe') ||
      process.argv[1].endsWith('\\circe') ||
      process.argv[1] === 'circe'));

if (isDirectExecution) {
  const rawArgs = process.argv.slice(2);
  await main(rawArgs).catch((err) => {
    const normalized = normalizeError(err);
    if (wantsJson(rawArgs)) {
      process.stdout.write(`${renderErrorJson(normalized)}\n`);
    } else {
      process.stderr.write(`${renderError(normalized)}\n`);
    }
    process.exit(exitCodeFor(normalized));
  });
}
