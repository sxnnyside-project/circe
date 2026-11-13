/**
 * Options for formatting CLI help output.
 *
 * @internal
 */
export interface HelpOptions {
  /**
   * Whether to format with ANSI terminal colors.
   * If omitted, auto-detected from `process.stdout.isTTY` and `NO_COLOR`.
   */
  readonly color?: boolean;
}

/**
 * Checks whether color output should be enabled for stdout.
 *
 * @remarks
 * Color is disabled if:
 * 1. The `NO_COLOR` environment variable is defined (per https://no-color.org).
 * 2. `stdout` is not an interactive terminal (pipes, CI redirects, subshells).
 *
 * @returns `true` if ANSI escape codes are permitted; otherwise `false`.
 *
 * @internal
 */
export function shouldColorize(override?: boolean): boolean {
  if (override !== undefined) return override;
  if (process.env.NO_COLOR !== undefined) return false;
  return Boolean(process.stdout.isTTY);
}

/**
 * Formats the primary help documentation for the Circe CLI.
 *
 * @remarks
 * Adheres to the Sxnnyside CLI design contract:
 * - Order of sections: `USAGE` → `COMMANDS` → `OPTIONS` → `EXAMPLES`.
 * - When color is active: section headers are bold, commands cyan, flags yellow, and annotations dim.
 *
 * @param options - Configuration options controlling colorization.
 * @returns Formatted multiline help string.
 *
 * @internal
 */
export function helpText(options?: HelpOptions): string {
  const color = shouldColorize(options?.color);

  // ANSI styling helpers
  const bold = (text: string) => (color ? `\x1b[1m${text}\x1b[0m` : text);
  const cyan = (text: string) => (color ? `\x1b[36m${text}\x1b[0m` : text);
  const yellow = (text: string) => (color ? `\x1b[33m${text}\x1b[0m` : text);
  const dim = (text: string) => (color ? `\x1b[2m${text}\x1b[0m` : text);

  return `${bold('circe')} — inversion-of-control framework for discord.js bots (Bun, Node.js, Deno).

${bold('USAGE')}
  circe <command> [options]

${bold('COMMANDS')}
  ${cyan('init')} [dir]           Scaffold a starter project in [dir] ${dim('(defaults to current directory)')}
  ${cyan('start')}                Load circe.config.ts, scan modules and log in
  ${cyan('dev')}                  Run start with file watching
  ${cyan('build')}                Validate configuration and every module without logging in
  ${cyan('doctor')}               Inspect environment, configuration, and dependencies
  ${cyan('routes')}               List all discovered interaction routes, patterns, and events
  ${cyan('manifest')}             Write .circe/project.json, a declarative summary of the bot ${dim('(--check verifies it)')}
  ${cyan('add')} <kind> <name>    Generate boilerplate for a command, event, component, modal, or guard
  ${cyan('completions')} <shell>  Print a completion script ${dim('(bash, zsh, fish, powershell)')}
  ${cyan('version')}              Print the version
  ${cyan('help')}                 Print this help

${bold('OPTIONS')}
  ${yellow('-h, --help')}           Print this help
  ${yellow('-V, --version')}        Print the version
      ${yellow('--json')}           Machine-readable output (init, build, doctor, routes, manifest, add)
      ${yellow('--format')} <fmt>   Output format: text, json ${dim('(json is equivalent to --json; errors become structured JSON on stdout)')}
      ${yellow('--check')}          manifest: fail with exit code 1 when .circe/project.json is stale
  ${yellow('-r, --runtime')} <rt>   Target runtime: bun, deno, node ${dim('(default: auto-detected)')}
  ${yellow('-t, --template')} <tpl> Template tier: minimal, standard, advanced ${dim('(default: minimal)')}
      ${yellow('--minimal')}        Shortcut for --template minimal
      ${yellow('--standard')}       Shortcut for --template standard
      ${yellow('--advanced')}       Shortcut for --template advanced
      ${yellow('--description')} <text> Description for slash commands
      ${yellow('--guild-only')}     Add guild-only guard to command
      ${yellow('--once')}           Set event to trigger once
      ${yellow('--prefix')} <pfx>   Custom ID prefix for component or modal
      ${yellow('--pattern')} <pat>  Pattern string for component routing
      ${yellow('--force')}          Overwrite existing file if present

${bold('EXAMPLES')}
  ${dim('# Initialize a new project')}
  circe init
  circe init my-bot --runtime deno --template standard

  ${dim('# Run diagnostics and route inspection')}
  circe doctor
  circe routes --json
  circe build --format json

  ${dim('# Keep the agent-readable project manifest current')}
  circe manifest
  circe manifest --check

  ${dim('# Generate application code')}
  circe add command ping --description "Replies with pong" --guild-only
  circe add event ready --once
  circe add component button --prefix "btn:click:"
  circe add modal feedback
  circe add guard admin
`;
}

/**
 * Executes the `help` command, writing usage instructions to stdout.
 *
 * @remarks
 * **Process Semantics:**
 * - Writes formatted help text to `process.stdout`.
 * - Never throws or exits with error.
 * - Zero network access, zero filesystem mutation.
 *
 * @param options - Optional formatting configuration.
 *
 * @internal
 */
export function runHelp(options?: HelpOptions): void {
  process.stdout.write(helpText(options));
}
