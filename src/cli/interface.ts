import { readFileSync } from 'node:fs';

export const COMMANDS = [
  'init',
  'start',
  'dev',
  'build',
  'completions',
  'version',
  'help',
] as const;
export const SHELLS = ['bash', 'zsh', 'fish', 'powershell'] as const;
export type Shell = (typeof SHELLS)[number];

/** Resolves to the package root from both `src/cli/` and the bundled `dist/cli/`. */
export function readVersion(): string {
  const manifest = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
}

export function helpText(): string {
  return `circe — inversion-of-control framework for discord.js bots (Bun, Node.js, Deno).

USAGE
  circe <command> [options]

COMMANDS
  init                 Scaffold circe.config.ts and a starter project in the current directory
  start                Load circe.config.ts, scan modules and log in
  dev                  Run start with file watching
  build                Validate configuration and every module without logging in
  completions <shell>  Print a completion script (bash, zsh, fish, powershell)
  version              Print the version

OPTIONS
  -h, --help           Print this help
  -V, --version        Print the version
      --json           Machine-readable output (init)

EXAMPLES
  circe init
  circe dev
  circe completions zsh > ~/.zfunc/_circe
`;
}

export function completionScript(shell: Shell): string {
  const words = COMMANDS.join(' ');
  switch (shell) {
    case 'bash':
      return `_circe() { COMPREPLY=($(compgen -W "${words}" -- "\${COMP_WORDS[COMP_CWORD]}")); }\ncomplete -F _circe circe\n`;
    case 'zsh':
      return `#compdef circe\n_arguments '1: :(${words})'\n`;
    case 'fish':
      return `complete -c circe -f -n '__fish_use_subcommand' -a '${words}'\n`;
    case 'powershell':
      return `Register-ArgumentCompleter -Native -CommandName circe -ScriptBlock {\n  param($word)\n  '${COMMANDS.join("','")}' | Where-Object { $_ -like "$word*" }\n}\n`;
  }
}

export function isShell(value: string | undefined): value is Shell {
  return SHELLS.includes(value as Shell);
}

export type ParsedArgs =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'completions'; readonly shell: string | undefined; readonly json: boolean }
  | { readonly kind: 'run'; readonly command: string | undefined; readonly json: boolean };

/**
 * `--help`/`--version` anywhere win over the command: asking for help must
 * never run `init` (which writes files) or `start` (which logs in).
 */
export function parseArgs(args: readonly string[]): ParsedArgs {
  if (args.includes('-h') || args.includes('--help')) return { kind: 'help' };
  if (args.includes('-V') || args.includes('--version')) return { kind: 'version' };

  const json = args.includes('--json');
  const positionals = args.filter((arg) => !arg.startsWith('-'));
  const command = positionals[0];

  if (command === 'help') return { kind: 'help' };
  if (command === 'version') return { kind: 'version' };
  if (command === 'completions') return { kind: 'completions', shell: positionals[1], json };
  return { kind: 'run', command, json };
}
