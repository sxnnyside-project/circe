# Configuration Contract

`circe.config.ts` is the declarative configuration root read by the Circe CLI (`circe dev`, `circe start`, `circe build`). This document specifies its interface, runtime behavior, and extension boundaries.

---

## 1. Design Principles

1. **Declarative, not executable**: The file exports configuration; it does not start the bot or perform side effects.
2. **Strict schema validation**: Framework configuration is typed and closed. Unknown keys are rejected during startup.
3. **Environment validation via Zod**: Secrets (`token`, `clientId`) are defined via `defineConfig(z.object(...))` and loaded from the environment at startup rather than evaluated inside the file.
4. **Programmatic equivalence**: `circe.config.ts` compiles down to the same options accepted by the lower-level `createCirce()` API.

---

## 2. Configuration Schema

```ts
import type { GatewayIntentBits } from "discord.js";
import type { z } from "zod";
import type { CirceConfig } from "./config.js";
import type { CirceIntegration } from "./integration.js";

export type TransportMode = "gateway" | "http" | "hybrid";

export interface HttpTransportConfig {
  /** Hex-encoded Ed25519 public key from the Discord Developer Portal. */
  readonly publicKey: string;
  /** Port the interactions server listens on. Defaults to 8787. */
  readonly port?: number;
}

export interface CirceConfigFile<Schema extends z.ZodType> {
  readonly config: CirceConfig<Schema>;
  readonly intents: GatewayIntentBits[];
  /** Remaining discord.js `Client` options: `partials`, `presence`, `allowedMentions`, `makeCache`, `sweepers`, ... */
  readonly client?: Omit<ClientOptions, "intents">;
  /** Serves `/health` and `/ready` on its own port; listens before login. */
  readonly health?: HealthConfig;
  /** Directory the CLI scans for modules, relative to circe.config.ts. Defaults to "./src". */
  readonly scanRoot?: string;
  /** Transport mode: "gateway" (default), "http", or "hybrid". */
  readonly transport?: TransportMode;
  /** Required when transport is "http" or "hybrid". */
  readonly http?: HttpTransportConfig;
  /** External extensions contributing scan roots or lifecycle hooks. */
  readonly integrations?: readonly CirceIntegration[];
}

export function defineCirceConfig<Schema extends z.ZodType>(
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
  /** Hook executed once the gateway is ready, receiving the logged-in `Client`. */
  onReady(hook: (client: Client) => void | Promise<void>): void;
  /** Runs `task` on an interval once the gateway is ready; cleared on shutdown. */
  every(intervalMs: number, task: (client: Client) => void | Promise<void>, options?: { name?: string; runImmediately?: boolean }): void;
}
```

Integrations are deliberately constrained:
- They can contribute additional directory scan roots (e.g., pre-built commands from an npm library).
- They can register startup (`onStart`) and teardown (`onStop`) hooks.
- They can register an `onReady` hook that receives the logged-in `Client` — the only moment an integration sees it. It runs in registration order, a throwing hook is logged without stopping the rest, and it never fires under the HTTP-only transport (no gateway connection).
- They cannot mutate interaction routing or access the raw Discord client during setup.

---

## 5. Client Options

`client` is spread under `intents` into `new Client(...)`, so everything discord.js accepts (partials, presence, allowed mentions, cache and sweeper policy, REST options, shard list) is configurable without leaving the declarative path. `intents` stays top-level and cannot be set twice.

## 6. Health Endpoints

```ts
interface HealthConfig {
  readonly port: number;
  readonly host?: string; // e.g. "127.0.0.1"; defaults to all interfaces
  readonly checks?: Record<string, () => boolean | Promise<boolean>>;
  readonly checkTimeoutMs?: number; // default 2000
}
```

| Path | Meaning | Status |
| :--- | :--- | :--- |
| `/health` | Liveness: the process answers. | `200` always |
| `/ready` | The app finished starting, the gateway is connected (when one is expected), and every check passes. | `200`, or `503` with `starting` / `unavailable` |

`/ready` check results are reused for one second, so a probe flood cannot become a check flood.

The server starts before any `onStart` hook (so a probe during migrations sees a live process, not a refused connection) and stops last. It serves only these two paths and exposes no metrics; under the HTTP-only transport the gateway is not required for readiness. A check that returns `false`, throws or exceeds its timeout is reported as `failed`.

## 7. Scheduled Work

`app.every(intervalMs, task, { name?, runImmediately? })` (and `ctx.every` on integrations) starts a timer when the gateway is ready and clears it on shutdown. Runs never overlap, and a throwing task is logged, not fatal. This is timing only: schedules are not persisted, so work that must survive a restart (a reminder due in a week) belongs in the bot's own storage, polled by an interval.

## 8. Validation Diagnostics

Errors in `circe.config.ts` are reported at scan-time with exact property paths before any connection to Discord is initiated:

```
✗ circe.config.ts
  Configuration schema validation failed:
  - config.token: Required
  - http.publicKey: Required when transport is "http"
```

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

