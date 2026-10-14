# Deploying on Deno 2

Circe supports Deno 2 natively using standard npm package specifiers. The application lifecycle, filesystem discovery, module contracts, and HTTP interaction serving run without code modifications.

---

## 1. Project Configuration (`deno.json`)

Declare dependency specifiers in a `deno.json` at your project root alongside `circe.config.ts`:

```json
{
  "imports": {
    "@sxnnyside/circe": "npm:@sxnnyside/circe@^1.0.0",
    "discord.js": "npm:discord.js@^14.16.0",
    "zod": "npm:zod@^3.24.0"
  }
}
```

---

## 2. Running the Bot

### Project Scaffolding

Scaffold a complete starter project with configuration, typed schema, sample ping command, and environment template:

```bash
deno run --allow-read --allow-write npm:@sxnnyside/circe/cli init
```

Deno enforces an explicit permission security model. Circe runtime commands require the following permissions:

| Permission | Purpose |
| :--- | :--- |
| `--allow-net` | Connect to the Discord REST API, Gateway WebSocket, and bind the HTTP webhook port |
| `--allow-env` | Read environment variables defined in credentials schemas |
| `--allow-read` | Scan `scanRoot` (`src/`) for commands, events, and component definitions |
| `--allow-run` | `circe dev` only: it restarts the bot as a child process on every file change |

### Local Development

Run the CLI directly via npm specifier. `dev` also needs `--allow-run`, because it restarts the bot as a child process on every change (the child inherits the permissions you grant here):

```bash
deno run --allow-net --allow-env --allow-read --allow-run npm:@sxnnyside/circe/cli dev
```

### Production Execution

```bash
deno run --allow-net --allow-env --allow-read npm:@sxnnyside/circe/cli start
```

### Pre-flight CI Validation

Run contract verification without opening a Discord connection:

```bash
deno run --allow-net --allow-env --allow-read npm:@sxnnyside/circe/cli build
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

> [!NOTE]
> The Bun SQLite store (`@sxnnyside/circe/bun-sqlite`) is runtime-specific to Bun. When deploying on Deno, use the default `MemoryCooldownStore` or provide an external database store.

---

## 4. Docker Deployment

A lightweight production container using the official Deno base image:

```dockerfile
FROM denoland/deno:2.1.0 AS runner
WORKDIR /app

# Cache dependencies
COPY deno.json ./
RUN deno install

# Copy application source
COPY circe.config.ts ./
COPY src ./src

# Expose port only if using transport: "http" or "hybrid"
EXPOSE 8787

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "npm:@sxnnyside/circe/cli", "start"]
```

Build and run:

```bash
docker build -t circe-deno-bot .
docker run -d \
  --name circe-deno-bot \
  --env-file .env \
  -p 8787:8787 \
  circe-deno-bot
```

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

