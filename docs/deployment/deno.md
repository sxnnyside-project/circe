# Deploying on Deno 2

Circe supports Deno 2 natively using standard npm package specifiers. The application lifecycle, filesystem discovery, module contracts, and HTTP interaction serving run without code modifications.

---

## 1. Project Configuration (`deno.json`)

Declare dependency specifiers and task shortcuts in a `deno.json` at your project root alongside `circe.config.ts`:

```json
{
  "tasks": {
    "dev": "deno run --allow-net --allow-env --allow-read --allow-write --allow-run npm:@sxnnyside/circe/cli dev",
    "start": "deno run --allow-net --allow-env --allow-read npm:@sxnnyside/circe/cli start",
    "build": "deno run --allow-net --allow-env --allow-read npm:@sxnnyside/circe/cli build",
    "doctor": "deno run --allow-net --allow-env --allow-read npm:@sxnnyside/circe/cli doctor",
    "routes": "deno run --allow-net --allow-env --allow-read npm:@sxnnyside/circe/cli routes"
  },
  "imports": {
    "@sxnnyside/circe": "npm:@sxnnyside/circe@^1.2.0",
    "@sxnnyside/circe/sqlite": "npm:@sxnnyside/circe@^1.2.0/sqlite",
    "discord.js": "npm:discord.js@^14.28.1",
    "zod": "npm:zod@^3.24.0 || ^4.0.0"
  }
}
```

---

## 2. Running the Bot

### Project Scaffolding

Scaffold a complete Deno-native project directly in an empty directory using Deno:

```bash
deno run --allow-read --allow-write npm:@sxnnyside/circe/cli init --runtime deno --standard
```

Deno enforces an explicit permission security model. Circe runtime commands require the following permissions:

| Permission | Purpose |
| :--- | :--- |
| `--allow-net` | Connect to the Discord REST API, Gateway WebSocket, and bind the HTTP webhook port |
| `--allow-env` | Read environment variables defined in credentials schemas |
| `--allow-read` | Scan `scanRoot` (`src/`) for commands, events, and component definitions |
| `--allow-run` | `circe dev` only: restarts the bot as a child process on every file change |

### Local Development

Run the development server via Deno task (reloading on change with child process supervisor):

```bash
deno task dev
```

### Production Execution

```bash
deno task start
```

### Pre-flight CI Validation

Run contract verification without opening a Discord connection:

```bash
deno task build
```

---

## 3. HTTP Webhooks with `Deno.serve`

When `transport` is set to `"http"` or `"hybrid"` in `circe.config.ts`, Circe automatically hosts incoming Discord interactions using native `Deno.serve`:

```ts
import { defineCirceConfig, defineConfig } from "@sxnnyside/circe";
import { GatewayIntentBits } from "discord.js";
import { z } from "zod";

export default defineCirceConfig({
  config: defineConfig(
    z.object({
      token: z.string().min(1),
      clientId: z.string().min(1),
      guildId: z.string().optional(),
    }),
  ),
  intents: [GatewayIntentBits.Guilds],
  transport: "http",
  http: {
    publicKey: Deno.env.get("DISCORD_PUBLIC_KEY")!,
    port: 8787,
  },
});
```

Web Crypto verification uses Deno's native `crypto.subtle.verify` with standard Ed25519 support.

> [!TIP]
> **Universal SQLite on Deno:** Circe's `SqliteCooldownStore` (`import { SqliteCooldownStore } from "@sxnnyside/circe/sqlite"`) works under Deno 2.2+ (`node:sqlite` is not available in earlier 2.x releases) utilizing standard library `node:sqlite` (`DatabaseSync`) without extra drivers or compilation.

> [!IMPORTANT]
> **SQLite file permissions:** An on-disk database needs read and write access to its file (`--allow-read=./data --allow-write=./data`); `:memory:` needs none. The `start` task above grants read only, so add a scoped `--allow-write` if you persist cooldowns. The official `circe init` Deno templates run with `-A` for simplicity; narrow that for production.

---

## 4. Docker Deployment

A lightweight production container using the official Deno base image:

```dockerfile
FROM denoland/deno:2.2.0 AS runner
WORKDIR /app

# Cache dependencies
COPY deno.json ./
RUN deno install

# Copy application source
COPY circe.config.ts ./
COPY src/ ./src/

ENV NODE_ENV=production
EXPOSE 8787

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "npm:@sxnnyside/circe/cli", "start"]
```

---

## 5. Deno Deploy

Circe's `"http"` transport mode is fully compatible with [Deno Deploy](https://deno.com/deploy). Configure `transport: "http"`, deploy the repository, and bind your Discord Developer Portal Interactions Endpoint URL to your Deno Deploy project URL.

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*
