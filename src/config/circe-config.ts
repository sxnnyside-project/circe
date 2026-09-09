import type { GatewayIntentBits } from "discord.js";
import type { z } from "zod";
import type { CirceConfig } from "./config.js";
import type { CirceIntegration } from "./integration.js";

/**
 * `"gateway"` (default) — traditional WebSocket connection only.
 * `"http"` — no gateway connection at all; interactions arrive via an
 * HTTP Interactions Endpoint URL instead. `"hybrid"` — both: gateway for
 * everything else (message events, presence, ...), HTTP for interactions,
 * since Discord stops delivering interactions over the gateway once an
 * Interactions Endpoint URL is configured.
 */
export type TransportMode = "gateway" | "http" | "hybrid";

export interface HttpTransportConfig {
  /** Hex-encoded ed25519 public key from the Discord Developer Portal, used to verify incoming requests. */
  readonly publicKey: string;
  /** Port the interactions server listens on. Defaults to `8787`. */
  readonly port?: number;
}

export interface CirceConfigFile<Schema extends z.ZodType> {
  readonly config: CirceConfig<Schema>;
  readonly intents: GatewayIntentBits[];
  /** Directory the CLI scans for commands/events/components/modals, relative to `circe.config.ts`. Defaults to `"./src"`. */
  readonly scanRoot?: string;
  /** Named `{ name, setup(context) }` extensions — the sole extension point of `circe.config.ts`. See config-contract.md. */
  readonly integrations?: readonly CirceIntegration[];
  /** Defaults to `"gateway"`. Required alongside `http` when set to `"http"` or `"hybrid"`. */
  readonly transport?: TransportMode;
  readonly http?: HttpTransportConfig;
}

/**
 * Declares the CLI-driven entry point for a bot: which config schema to
 * load, which gateway intents to request, and where to scan for modules.
 * Identity helper only, same as `defineConfig`/`defineCommand` — exists for
 * type inference at the call site, not to transform its input.
 */
export function defineCirceConfig<Schema extends z.ZodType>(
  definition: CirceConfigFile<Schema>,
): CirceConfigFile<Schema> {
  return definition;
}
