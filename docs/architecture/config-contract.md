# Configuration Contract

`circe.config.ts` is the declarative configuration root read by the Circe CLI (`circe dev`, `circe start`, `circe build`, `circe doctor`). This document specifies its interface, runtime behavior, and extension boundaries.

---

## 1. Design Principles

1. **Declarative, not executable**: The file exports configuration; it does not start the bot or perform side effects.
2. **Strict schema validation**: Framework configuration is typed and closed. Unknown keys are rejected during startup.
3. **Decoupled environment validation**: Secrets (`token`, `clientId`) are defined via `defineConfig(schema)` and loaded from the environment at startup rather than evaluated inside the file. Works with Zod (v3 and v4), Valibot, ArkType, or any library implementing `SafeParseSchema` / Standard Schema v1.
4. **Compile-time transport safety**: TypeScript discriminated unions enforce `http: { publicKey }` when `transport` is `"http"` or `"hybrid"`.
5. **Programmatic equivalence**: `circe.config.ts` compiles down to the same options accepted by the lower-level `createCirce()` API.

---

## 2. Configuration Schema

```ts
import type { GatewayIntentBits, ClientOptions } from "discord.js";
import type { EnvConfig, SafeParseSchema } from "@sxnnyside/circe";

export type TransportMode = "gateway" | "http" | "hybrid";

export interface HttpTransportConfig {
  /** Hex-encoded Ed25519 public key from the Discord Developer Portal. */
  readonly publicKey: string;
  /** Port the interactions server listens on. Defaults to 8787. */
  readonly port?: number;
}

export interface CirceConfigFileBase<Schema extends SafeParseSchema = SafeParseSchema> {
  readonly config: EnvConfig<Schema>;
  readonly intents: GatewayIntentBits[];
  /** Remaining discord.js Client options: partials, presence, allowedMentions, sweepers, etc. */
  readonly client?: Omit<ClientOptions, "intents">;
  /** Serves /health (liveness) and /ready (readiness) before login. */
  readonly health?: HealthConfig;
  /** 'exit' (default) shuts the bot down on unhandled rejections; 'log' only logs it. */
  readonly onUnhandledRejection?: "exit" | "log";
  /** Longest a signal- or crash-triggered shutdown may take before a forced exit. Defaults to 10000ms. */
  readonly shutdownTimeoutMs?: number;
  /** Directory the CLI scans for modules, relative to circe.config.ts. Defaults to "./src". */
  readonly scanRoot?: string;
  /** External extensions contributing scan roots or lifecycle hooks. */
  readonly integrations?: readonly CirceIntegration[];
}

export interface CirceConfigFileGateway<Schema extends SafeParseSchema>
  extends CirceConfigFileBase<Schema> {
  readonly transport?: "gateway";
  readonly http?: HttpTransportConfig;
}

export interface CirceConfigFileHttp<Schema extends SafeParseSchema>
  extends CirceConfigFileBase<Schema> {
  readonly transport: "http";
  readonly http: HttpTransportConfig; // Required in http mode
}

export interface CirceConfigFileHybrid<Schema extends SafeParseSchema>
  extends CirceConfigFileBase<Schema> {
  readonly transport: "hybrid";
  readonly http: HttpTransportConfig; // Required in hybrid mode
}

export type CirceConfigFile<Schema extends SafeParseSchema = SafeParseSchema> =
  | CirceConfigFileGateway<Schema>
  | CirceConfigFileHttp<Schema>
  | CirceConfigFileHybrid<Schema>;

export function defineCirceConfig<Schema extends SafeParseSchema>(
  definition: CirceConfigFile<Schema>,
): CirceConfigFile<Schema>;
```

---

## 3. Transport Modes

Circe supports three transport modes in `circe.config.ts`:

| Mode | Behavior | Use Case |
| :--- | :--- | :--- |
| `"gateway"` | Standard Discord WebSocket connection (`client.login()`). | Traditional bots requiring continuous gateway events (message content, typing, voice, presence). |
| `"http"` | Stateless HTTP interactions server (`Bun.serve`, `Deno.serve`, `node:http`). Does not connect to the Gateway. | Serverless environments, containers, or webhook-only bots handling slash commands and components. |
| `"hybrid"` | Both Gateway WebSocket and HTTP Webhook server run concurrently. | Bots needing Gateway events (e.g. `guildMemberAdd`) while routing all interaction responses via fast HTTP webhooks. |

---

## 4. Integrations

The `integrations` array is the sole extension point for third-party packages to hook into Circe:

```ts
interface CirceIntegration {
  readonly name: string;
  setup(context: CirceIntegrationContext): void | Promise<void>;
}

interface CirceIntegrationContext {
  /** Adds an external directory to scan for a specific module category. */
  addScanRoot(
    category: "commands" | "command-groups" | "context-menus" | "events" | "components" | "modals",
    path: string,
  ): void;
  /** Hook executed before client login and command registration. */
  onStart(hook: () => void | Promise<void>): void;
  /** Hook executed after client shutdown. */
  onStop(hook: () => void | Promise<void>): void;
  /** Hook executed once the gateway is ready, receiving the logged-in Client. */
  onReady(hook: (client: Client) => void | Promise<void>): void;
  /** Runs task on an interval once the gateway is ready; cleared on shutdown. */
  every(
    intervalMs: number,
    task: (client: Client) => void | Promise<void>,
    options?: { name?: string; runImmediately?: boolean },
  ): void;
  /** Registers a named readiness probe served on the /ready endpoint. */
  addHealthCheck(name: string, check: HealthCheck): void;
}
```

Integrations are deliberately constrained:
- They cannot modify global state.
- They cannot intercept or wrap incoming interaction payloads directly.
- They cannot alter the execution order of core routers.

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*
