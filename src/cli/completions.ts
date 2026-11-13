import { COMMANDS } from './index.js';

/**
 * Supported shell environments for autocompletion generation.
 *
 * @internal
 */
export const SHELLS = ['bash', 'zsh', 'fish', 'powershell'] as const;

/**
 * Shell target identifier for completion scripts.
 *
 * @internal
 */
export type Shell = (typeof SHELLS)[number];

/**
 * Validates whether a given string corresponds to a supported shell environment.
 *
 * @param value - Candidate shell name.
 * @returns `true` if the shell is recognized and supported; otherwise `false`.
 *
 * @internal
 */
export function isShell(value: string | undefined): value is Shell {
  return SHELLS.includes(value as Shell);
}

/**
 * Generates a native shell autocompletion script for the Circe CLI.
 *
 * @remarks
 * Produces shell script snippets that register command completion for:
 * - `bash`: via `complete -F _circe circe` and `compgen`.
 * - `zsh`: via `#compdef circe` and `_arguments`.
 * - `fish`: via `complete -c circe`.
 * - `powershell`: via `Register-ArgumentCompleter`.
 *
 * @param shell - Target shell environment.
 * @param commands - List of registered CLI command verbs (defaults to `COMMANDS`).
 * @returns The generated autocompletion script as a string.
 *
 * @internal
 */
export function completionScript(shell: Shell, commands: readonly string[] = COMMANDS): string {
  const words = commands.join(' ');
  switch (shell) {
    case 'bash':
      return `_circe() { COMPREPLY=($(compgen -W "${words}" -- "\${COMP_WORDS[COMP_CWORD]}")); }\ncomplete -F _circe circe\n`;
    case 'zsh':
      return `#compdef circe\n_arguments '1: :(${words})'\n`;
    case 'fish':
      return `complete -c circe -f -n '__fish_use_subcommand' -a '${words}'\n`;
    case 'powershell':
      return `Register-ArgumentCompleter -Native -CommandName circe -ScriptBlock {\n  param($word)\n  '${commands.join("','")}' | Where-Object { $_ -like "$word*" }\n}\n`;
  }
}

/**
 * Executes the `completions` command, writing the shell completion script to stdout.
 *
 * @remarks
 * **Process Semantics:**
 * - Writes completion script directly to `process.stdout`.
 * - Pure string generation, zero filesystem or network side-effects.
 * - Safe for headless environments, redirection (`circe completions zsh > ~/.zsh/completion/_circe`), and subshells.
 *
 * @param shell - Validated shell name.
 * @param commands - Active list of CLI commands.
 *
 * @internal
 */
export function runCompletions(shell: Shell, commands: readonly string[]): void {
  process.stdout.write(completionScript(shell, commands));
}
