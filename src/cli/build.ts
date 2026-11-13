import { prepareApp } from '../application/prepare-app.js';
import { normalizeError } from '../errors/normalize-error.js';
import { exitCodeFor, renderError, renderErrorJson } from '../errors/render-error.js';
import { createLogger } from '../logging/logger.js';

/**
 * Options accepted by {@link runBuild}.
 *
 * @public
 */
export interface BuildOptions {
  /**
   * Emit a single machine-readable JSON document on stdout instead of log lines and stderr blocks.
   *
   * @defaultValue `false`
   */
  readonly json?: boolean | undefined;
}

/**
 * Module counts reported by a successful `build` under `--format json`.
 *
 * @public
 */
export interface BuildSummary {
  /** Always `true` for a passing build. */
  readonly ok: true;
  /** Registered module totals per category. */
  readonly summary: {
    readonly commands: number;
    readonly events: number;
    readonly components: number;
    readonly modals: number;
    readonly contextMenuCommands: number;
  };
}

/**
 * Executes the `build` pre-flight command in a project directory.
 *
 * @remarks
 * **Process Semantics:**
 * - Performs static analysis and IoC discovery across `circe.config.ts`, `src/commands/`,
 *   `src/events/`, `src/components/`, `src/modals/`, and `src/context-menus/`.
 * - **Zero Discord Gateway / REST connection:** Does not call `app.start()` and does not require credentials.
 * - **Exit Code Contract:**
 *   - Sets `process.exitCode = 0` and logs summary to stdout on success.
 *   - Sets `process.exitCode = 1` and logs diagnostic block to stderr on contract violations.
 * - **Structured Output:** With `options.json`, stdout carries exactly one JSON document —
 *   a {@link BuildSummary} on success or a structured error report on failure — and no log lines.
 * - **Headless / CI Safety:** Fully non-interactive, safe for automated build gates (`just check`).
 *
 * @param cwd - Absolute or relative project directory to build.
 * @param options - Output format selection.
 *
 * @example
 * ```typescript
 * import { runBuild } from './build.js';
 * await runBuild(process.cwd(), { json: true });
 * ```
 *
 * @internal
 */
export async function runBuild(cwd: string, options: BuildOptions = {}): Promise<void> {
  const json = options.json === true;
  const logger = json
    ? createLogger({ sink: () => {} })
    : createLogger({ metadata: { component: 'cli' } });

  try {
    const { app } = await prepareApp(cwd, logger);
    const summary = {
      commands: app.commands.registry.size,
      events: app.events.registry.size,
      components: app.components.registry.size,
      modals: app.modals.registry.size,
      contextMenuCommands: app.contextMenuCommands.registry.size,
    };

    if (json) {
      const report: BuildSummary = { ok: true, summary };
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      logger.info('Build check passed', summary);
    }
  } catch (error) {
    const normalized = normalizeError(error);
    if (json) {
      process.stdout.write(`${renderErrorJson(normalized)}\n`);
    } else {
      process.stderr.write(`${renderError(normalized)}\n`);
    }
    process.exitCode = exitCodeFor(normalized);
  }
}
