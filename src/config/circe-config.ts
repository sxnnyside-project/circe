import type { ClientOptions, GatewayIntentBits } from 'discord.js';
import type { z } from 'zod';
import type { HealthConfig } from '../health/handler.js';
import type { InteractionTelemetryHandler } from '../observability/metrics.js';
import type { CirceConfig } from './env-config.js';
import type { CirceIntegration } from './integration.js';

/**
 * Supported transport modes:
 * - `"gateway"`: Traditional WebSocket connection only.
 * - `"http"`: No gateway connection; interactions arrive via an HTTP Interactions Endpoint URL.
 * - `"hybrid"`: Both: gateway for non-interaction events, HTTP for interactions.
 *
 * @remarks
 * In `"http"` or `"hybrid"` mode, Discord delivers interactions directly over HTTP via webhook,
 * requiring cryptographic Ed25519 signature verification on every incoming request.
 *
 * @public
 */
export type TransportMode = 'gateway' | 'http' | 'hybrid';

/**
 * Options for configuring HTTP Interactions transport.
 *
 * @public
 */
export interface HttpTransportConfig {
  /** Hex-encoded Ed25519 public key from the Discord Developer Portal, used to verify incoming requests. */
  readonly publicKey: string;

  /**
   * Port the HTTP interactions server listens on.
   *
   * @defaultValue `8787`
   */
  readonly port?: number;
}

/**
 * Common configuration options shared across all transport modes.
 *
 * @internal
 */
interface CirceConfigFileBase<Schema extends z.ZodType> {
  /** Typed environment configuration contract. */
  readonly config: CirceConfig<Schema>;

  /** Gateway intent bits required by this bot. */
  readonly intents: GatewayIntentBits[];

  /** Remaining discord.js `Client` options: `partials`, `presence`, `allowedMentions`, `makeCache`, `sweepers`, ... */
  readonly client?: Omit<ClientOptions, 'intents'>;

  /** Serves `/health` and `/ready`; listens before login. Omit to run no health server. */
  readonly health?: HealthConfig;

  /**
   * What happens on an unhandled promise rejection:
   * - `'exit'` (default): shuts down gracefully.
   * - `'log'`: logs error without terminating process.
   *
   * @defaultValue `'exit'`
   */
  readonly onUnhandledRejection?: 'exit' | 'log';

  /**
   * Longest a signal- or crash-triggered shutdown may take before process is forced to exit.
   *
   * @defaultValue `10000`
   */
  readonly shutdownTimeoutMs?: number;

  /**
   * Directory the CLI scans for commands/events/components/modals, relative to `circe.config.ts`.
   *
   * @defaultValue `"./src"`
   */
  readonly scanRoot?: string;

  /** Named `{ name, setup(context) }` extensions — the sole extension point of `circe.config.ts`. */
  readonly integrations?: readonly CirceIntegration[];

  /**
   * Telemetry callback triggered on every interaction completion.
   *
   * @remarks
   * Emits duration, outcome status, and routing metadata for Golden Signals APM integration.
   */
  readonly onInteractionComplete?: InteractionTelemetryHandler;
}

/**
 * Discriminated declaration of a bot's `circe.config.ts` manifest.
 *
 * @remarks
 * Enforces compile-time type safety:
 * - If `transport: 'http'` or `transport: 'hybrid'`, `http: { publicKey }` is strictly required.
 * - If `transport: 'gateway'` (or omitted), `http` is optional.
 *
 * @example
 * ```ts
 * import { defineCirceConfig, defineConfig } from '@sxnnyside/circe';
 * import { GatewayIntentBits } from 'discord.js';
 * import { z } from 'zod';
 *
 * export default defineCirceConfig({
 *   config: defineConfig(z.object({ DISCORD_TOKEN: z.string() })),
 *   intents: [GatewayIntentBits.Guilds],
 *   transport: 'gateway',
 * });
 * ```
 *
 * @public
 */
export type CirceConfigFile<Schema extends z.ZodType = z.ZodType> =
  | (CirceConfigFileBase<Schema> & {
      /** Traditional WebSocket connection only (default). */
      readonly transport?: 'gateway';
      readonly http?: HttpTransportConfig;
    })
  | (CirceConfigFileBase<Schema> & {
      /** No gateway connection; interactions arrive via HTTP Interactions Endpoint URL. */
      readonly transport: 'http';
      /** Required HTTP interactions endpoint configuration. */
      readonly http: HttpTransportConfig;
    })
  | (CirceConfigFileBase<Schema> & {
      /** Both gateway (for non-interaction events) and HTTP (for interactions). */
      readonly transport: 'hybrid';
      /** Required HTTP interactions endpoint configuration. */
      readonly http: HttpTransportConfig;
    });

/**
 * Declares the CLI-driven entry point for a bot in `circe.config.ts`:
 * config schema, gateway intents, module scan roots, and transport mode.
 *
 * @param definition - Configuration manifest specifying environment schema, intents, integrations, and runtime behavior.
 * @returns The validated and typed `CirceConfigFile` definition.
 * @example
 * ```ts
 * export default defineCirceConfig({
 *   config: defineConfig(schema),
 *   intents: [GatewayIntentBits.Guilds],
 * });
 * ```
 * @public
 */
export function defineCirceConfig<Schema extends z.ZodType>(
  definition: CirceConfigFile<Schema>,
): CirceConfigFile<Schema> {
  return definition;
}
