/**
 * Canonical backward-compatibility interface re-exports.
 *
 * @remarks
 * CLI features have been modularized into single-command modules adhering to Sxnnyside DX purism:
 * - `completions`: `src/cli/completions.ts`
 * - `help`: `src/cli/help.ts`
 * - `version`: `src/cli/version.ts`
 * - `parseArgs`: `src/cli/index.ts`
 *
 * @internal
 */

export {
  completionScript,
  isShell,
  runCompletions,
  SHELLS,
  type Shell,
} from './completions.js';
export {
  type HelpOptions,
  helpText,
  runHelp,
  shouldColorize,
} from './help.js';
export {
  COMMANDS,
  type CommandName,
  didYouMean,
  levenshteinDistance,
  main,
  type ParsedArgs,
  parseArgs,
  wantsJson,
} from './index.js';

export {
  readVersion,
  runVersion,
} from './version.js';
