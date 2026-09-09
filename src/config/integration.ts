import type { LifecycleHook } from "../application/lifecycle.js";
import { CirceError } from "../errors/circe-error.js";

/** Raised when an integration's `setup()` throws — always attributed to that integration's `name`. */
export class IntegrationError extends CirceError {}

export type ScanCategory = "commands" | "command-groups" | "context-menus" | "events" | "components" | "modals";

export interface CirceIntegrationContext {
  /** Contributes an additional directory to scan for `category`, alongside `scanRoot`. */
  addScanRoot(category: ScanCategory, path: string): void;
  /** Same ordering guarantees as the programmatic `onStart`: runs before login and command registration. */
  onStart(hook: LifecycleHook): void;
  /** Same ordering guarantees as the programmatic `onStop`: runs after the client has been destroyed. */
  onStop(hook: LifecycleHook): void;
}

export interface CirceIntegration {
  readonly name: string;
  setup(context: CirceIntegrationContext): void | Promise<void>;
}

/** Identity helper — same purpose as `defineCommand`/`defineCirceConfig`. */
export function defineIntegration(definition: CirceIntegration): CirceIntegration {
  return definition;
}

export interface ResolvedIntegrations {
  readonly scanRoots: Readonly<Record<ScanCategory, readonly string[]>>;
  readonly onStartHooks: readonly LifecycleHook[];
  readonly onStopHooks: readonly LifecycleHook[];
}

/**
 * Runs every integration's `setup()` once, collecting the narrow set of
 * things it's allowed to contribute — extra scan roots and lifecycle
 * hooks — rather than handing it the application directly. A `setup` that
 * throws is reported with that integration's `name` attached, never as an
 * unattributed startup crash.
 */
export async function resolveIntegrations(
  integrations: readonly CirceIntegration[] = [],
): Promise<ResolvedIntegrations> {
  const scanRoots: Record<ScanCategory, string[]> = {
    commands: [],
    "command-groups": [],
    "context-menus": [],
    events: [],
    components: [],
    modals: [],
  };
  const onStartHooks: LifecycleHook[] = [];
  const onStopHooks: LifecycleHook[] = [];

  for (const integration of integrations) {
    const context: CirceIntegrationContext = {
      addScanRoot: (category, path) => {
        scanRoots[category].push(path);
      },
      onStart: (hook) => {
        onStartHooks.push(hook);
      },
      onStop: (hook) => {
        onStopHooks.push(hook);
      },
    };

    try {
      await integration.setup(context);
    } catch (error) {
      throw new IntegrationError(`Integration "${integration.name}" failed during setup`, {
        cause: error,
        metadata: { integration: integration.name },
      });
    }
  }

  return { scanRoots, onStartHooks, onStopHooks };
}
