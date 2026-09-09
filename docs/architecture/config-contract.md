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
}
```

Integrations are deliberately constrained:
- They can contribute additional directory scan roots (e.g., pre-built commands from an npm library).
- They can register startup (`onStart`) and teardown (`onStop`) hooks.
- They cannot mutate interaction routing or access the raw Discord client directly during setup.

---

## 5. Validation Diagnostics

Errors in `circe.config.ts` are reported at scan-time with exact property paths before any connection to Discord is initiated:

```
✗ circe.config.ts
  Configuration schema validation failed:
  - config.token: Required
  - http.publicKey: Required when transport is "http"
```

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

