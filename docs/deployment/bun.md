# Deploying on Bun

Bun is Circe's primary runtime. Every framework capability — the CLI, the HTTP Interactions server via `Bun.serve`, and SQLite cooldown persistence via `bun:sqlite` — runs natively with zero runtime emulation.

---

## 1. Running the Bot

### Project Scaffolding

Scaffold a complete starter project with configuration, typed schema, sample ping command, and environment template:

```bash
bun x circe init
```

### Local Development

`circe dev` watches the `scanRoot` directory and `circe.config.ts`, restarting the child process on file changes with a clean module cache:

```bash
bun x circe dev
```

### Production Execution

`circe start` loads `circe.config.ts`, validates credentials and module contracts, registers Discord commands, and starts the bot process:

```bash
bun install --production
bun x circe start
```

### Pre-flight CI Validation

Before deploying, run `circe build` in your CI pipeline. It parses configuration, validates all command and event module contracts, and checks for conflicting identifiers without establishing a Discord Gateway connection:

```bash
bun x circe build
```

---

## 2. Configuration & Transports

Declare your bot configuration in `circe.config.ts`:

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
  transport: "gateway", // "gateway" | "http" | "hybrid"
});
```

### HTTP Webhooks Mode

When deploying as a stateless webhook receiver (`transport: "http"` or `"hybrid"`), provide your Discord application's public key:

```ts
export default defineCirceConfig({
  // ...config and intents
  transport: "http",
  http: {
    publicKey: process.env.DISCORD_PUBLIC_KEY!,
    port: 8787, // default: 8787
  },
});
```

In HTTP mode, `circe start` binds `Bun.serve` directly on the configured port and validates incoming `X-Signature-Ed25519` headers using native `crypto.subtle.verify`.

> [!NOTE]
> Discord requires your Interactions Endpoint URL to be served over HTTPS. Place a reverse proxy (Caddy, Nginx, or Cloudflare Tunnel) with TLS termination in front of your Bun port.

---

## 3. Docker Deployment

A minimal production container using the official Bun image:

```dockerfile
FROM oven/bun:1.2-slim AS base
WORKDIR /app

# Install production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy application source
COPY circe.config.ts ./
COPY src ./src

# Expose port only if using transport: "http" or "hybrid"
EXPOSE 8787

CMD ["bun", "x", "circe", "start"]
```

Build and run:

```bash
docker build -t my-circe-bot .
docker run -d \
  --name my-circe-bot \
  --env-file .env \
  -p 8787:8787 \
  my-circe-bot
```

---

## 4. VPS Deployment (systemd)

To run Circe as a persistent Linux service on a VPS:

Create `/etc/systemd/system/circe-bot.service`:

```ini
[Unit]
Description=Circe Discord Bot
After=network.target

[Service]
Type=simple
User=botuser
WorkingDirectory=/opt/circe-bot
ExecStart=/usr/local/bin/bun x circe start
Restart=on-failure
RestartSec=5s
EnvironmentFile=/opt/circe-bot/.env

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/circe-bot/data

[Install]
WantedBy=multi-user.target
```

Reload systemd and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now circe-bot
sudo journalctl -u circe-bot -f
```

---

## 5. Bun SQLite Cooldown Store

To persist rate limits across restarts with sub-millisecond overhead on Bun, import the isolated SQLite store:

```ts
import { BunSqliteCooldownStore } from "@sxnnyside/circe/bun-sqlite";
import { cooldown } from "@sxnnyside/circe";

// Pass the file path as a string (defaults to ":memory:" if omitted)
const store = new BunSqliteCooldownStore("./data/cooldowns.sqlite");

export const userCooldown = cooldown({
  durationMs: 5000,
  scope: "user",
  store,
});
```

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

