import type { SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { prepareApp } from '../application/prepare-app.js';
import { createLogger } from '../logging/logger.js';

/**
 * Categorical type of an interaction route registered in Circe.
 *
 * @public
 */
export type RouteKind =
  | 'command'
  | 'subcommand'
  | 'user-context-menu'
  | 'message-context-menu'
  | 'component'
  | 'modal'
  | 'event';

/**
 * Structured description of a single discovered route.
 *
 * @public
 */
export interface RouteInfo {
  /** Interaction category. */
  readonly kind: RouteKind;
  /** Public identifier or matching prefix. */
  readonly name: string;
  /** Human-readable purpose or description. */
  readonly description?: string | undefined;
  /** Custom ID matching pattern if configured. */
  readonly pattern?: string | undefined;
  /** Total active guards guarding this route. */
  readonly guards: number;
  /** Extra metadata (e.g. event once flag, subcommand parent). */
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Potential prefix overlap or specificity warning between component handlers.
 *
 * @public
 */
export interface PrefixHierarchyWarning {
  /** The more specific prefix. */
  readonly prefix: string;
  /** The broader prefix that also matches. */
  readonly parentPrefix: string;
  /** Explanation of longest-prefix routing behavior. */
  readonly note: string;
}

/**
 * Complete inspection report returned by {@link runRoutes}.
 *
 * @public
 */
export interface RoutesReport {
  /** All discovered routes. */
  readonly routes: readonly RouteInfo[];
  /** Prefix hierarchies detected across components. */
  readonly prefixHierarchies: readonly PrefixHierarchyWarning[];
  /** Total routes count. */
  readonly total: number;
}

/** Plain code-unit order: `localeCompare` follows the machine's locale, and the manifest built from this is committed. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Scans the project in `cwd` using Circe's IoC module loader and produces a route map.
 *
 * @remarks
 * Does not start the client or log in to Discord. Useful for CI auditing,
 * verifying routing tables, detecting prefix overlap, and feeding structured CAX manifests.
 *
 * @param cwd - Project root containing `circe.config.ts`.
 * @returns Complete {@link RoutesReport} inventory.
 *
 * @example
 * ```ts
 * const report = await runRoutes(process.cwd());
 * console.log(`Discovered ${report.total} interaction routes`);
 * ```
 *
 * @public
 */
export async function runRoutes(cwd: string): Promise<RoutesReport> {
  const logger = createLogger({ sink: () => {} });
  const { app } = await prepareApp(cwd, logger, { inspectOnly: true });

  const routes: RouteInfo[] = [];

  // 1. Slash commands and subcommands
  for (const cmd of app.commands.registry.all) {
    const builder = cmd.builder;
    const baseGuards = cmd.guards?.length ?? 0;

    // Check for nested subcommands or groups
    const options = builder.options ?? [];
    const subcommands: (SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder)[] = [];

    for (const opt of options) {
      const json = opt.toJSON();
      // Type 1 is SUB_COMMAND, Type 2 is SUB_COMMAND_GROUP
      if (json.type === 1 || json.type === 2) {
        subcommands.push(opt as unknown as SlashCommandSubcommandBuilder);
      }
    }

    if (subcommands.length === 0) {
      routes.push({
        kind: 'command',
        name: `/${builder.name}`,
        description: builder.description,
        guards: baseGuards,
      });
    } else {
      for (const sub of subcommands) {
        const subJson = sub.toJSON();
        if (subJson.type === 1) {
          routes.push({
            kind: 'subcommand',
            name: `/${builder.name} ${subJson.name}`,
            description: subJson.description,
            guards: baseGuards,
          });
        } else if (subJson.type === 2) {
          const groupJson = subJson as unknown as {
            name: string;
            options?: { name: string; description: string }[];
          };
          for (const leaf of groupJson.options ?? []) {
            routes.push({
              kind: 'subcommand',
              name: `/${builder.name} ${groupJson.name} ${leaf.name}`,
              description: leaf.description,
              guards: baseGuards,
            });
          }
        }
      }
    }
  }

  // 2. User context menus
  for (const cmd of app.contextMenuCommands.registry.allUser) {
    routes.push({
      kind: 'user-context-menu',
      name: cmd.name,
      guards: cmd.guards?.length ?? 0,
    });
  }

  // 3. Message context menus
  for (const cmd of app.contextMenuCommands.registry.allMessage) {
    routes.push({
      kind: 'message-context-menu',
      name: cmd.name,
      guards: cmd.guards?.length ?? 0,
    });
  }

  // 4. Message components
  const componentPrefixes: string[] = [];
  for (const comp of app.components.registry.all) {
    componentPrefixes.push(comp.prefix);
    const rawComp = comp as unknown as Record<string, unknown>;
    const pattern = typeof rawComp.pattern === 'string' ? rawComp.pattern : undefined;

    routes.push({
      kind: 'component',
      name: comp.prefix,
      pattern,
      guards: comp.guards?.length ?? 0,
    });
  }

  // Prefix hierarchy analysis (longest-prefix match check)
  const prefixHierarchies: PrefixHierarchyWarning[] = [];
  for (let i = 0; i < componentPrefixes.length; i++) {
    for (let j = 0; j < componentPrefixes.length; j++) {
      if (i !== j) {
        const p1 = componentPrefixes[i]!;
        const p2 = componentPrefixes[j]!;
        if (p1.startsWith(p2)) {
          prefixHierarchies.push({
            prefix: p1,
            parentPrefix: p2,
            note: `Longest-prefix rule resolves '${p1}' first; fallback to '${p2}' for non-matching tails.`,
          });
        }
      }
    }
  }

  // 5. Modals
  for (const modal of app.modals.registry.all) {
    routes.push({
      kind: 'modal',
      name: modal.prefix,
      guards: modal.guards?.length ?? 0,
    });
  }

  // 6. Events
  for (const evt of app.events.registry.all) {
    routes.push({
      kind: 'event',
      name: String(evt.name),
      guards: 0,
      details: { once: Boolean(evt.once) },
    });
  }

  // Sort deterministically by kind, then name
  routes.sort((a, b) => {
    return compareText(a.kind, b.kind) || compareText(a.name, b.name);
  });

  return {
    routes,
    prefixHierarchies,
    total: routes.length,
  };
}

/**
 * Formats a {@link RoutesReport} as a clean terminal table.
 *
 * @param report - Route inventory report.
 * @returns Human-readable formatted string.
 *
 * @public
 */
export function renderRoutesReport(report: RoutesReport): string {
  const lines: string[] = ['Circe Interaction Routes', ''];

  if (report.routes.length === 0) {
    lines.push('  No interaction routes discovered in project.');
    return lines.join('\n');
  }

  // Calculate column widths
  const maxKind = Math.max(4, ...report.routes.map((r) => r.kind.length));
  const maxName = Math.max(4, ...report.routes.map((r) => r.name.length));
  const maxGuards = 6;

  const header = `  ${'KIND'.padEnd(maxKind)}  ${'NAME / PATTERN'.padEnd(maxName)}  ${'GUARDS'.padEnd(maxGuards)}  DESCRIPTION / DETAILS`;
  lines.push(header);
  lines.push(`  ${'-'.repeat(header.length - 2)}`);

  for (const r of report.routes) {
    const kind = r.kind.padEnd(maxKind);
    const name = r.name.padEnd(maxName);
    const guards = String(r.guards).padStart(maxGuards);
    let desc = r.description ?? '';
    if (r.pattern) desc = `[pattern: ${r.pattern}] ${desc}`;
    if (r.details?.once) desc = `[once: true] ${desc}`;

    lines.push(`  ${kind}  ${name}  ${guards}  ${desc.trim()}`);
  }

  if (report.prefixHierarchies.length > 0) {
    lines.push('', '  Prefix Hierarchies:');
    for (const h of report.prefixHierarchies) {
      lines.push(`    - '${h.prefix}' overlays '${h.parentPrefix}' (longest-prefix match)`);
    }
  }

  lines.push('', `Total routes discovered: ${report.total}`);
  return lines.join('\n');
}
