# Deploying on Node.js 22+

Circe runs natively on Node.js 22.18 or later (the first release that loads `circe.config.ts` without a flag). The same `circe.config.ts` configuration, commands, and events run without code modifications.

---

## 1. Running the Bot

### Installation

```bash
npm install @sxnnyside/circe discord.js zod
```

### Project Scaffolding

Scaffold a complete starter project with configuration, typed schema, sample ping command, and environment template:

```bash
npx circe init
```

### Local Development

`circe dev` runs under Node via `npx`, watching `scanRoot` and restarting on file changes:

```bash
npx circe dev
```

### Production Execution

```bash
npx circe start
```

### Pre-flight CI Validation

Validate module contracts and configuration schemas without connecting to Discord:

```bash
npx circe build
```

---

## 2. HTTP Webhooks on Node

When `transport` is set to `"http"` or `"hybrid"`, Circe hosts the interaction receiver on a built-in `node:http` bridge:

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
    publicKey: process.env.DISCORD_PUBLIC_KEY!,
    port: 8787,
  },
});
```

Web Crypto verification uses Node's global `crypto.subtle.verify` with standard Ed25519 support.

> [!NOTE]
> The SQLite cooldown store (`@sxnnyside/circe/bun-sqlite`) depends on Bun. When deploying on Node, use the default `MemoryCooldownStore` or provide a custom `CooldownStore` implementation.

---

## 3. Production Process Management (PM2)

For virtual machines and dedicated servers, manage the process with PM2:

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: "circe-bot",
      script: "npx",
      args: "circe start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
```

Start and persist:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 4. Docker Deployment

A multi-stage production container using `node:22-slim`:

```dockerfile
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY circe.config.ts ./
COPY src ./src

# Expose port only if using transport: "http" or "hybrid"
EXPOSE 8787

CMD ["npx", "circe", "start"]
```

Build and run:

```bash
docker build -t circe-bot .
docker run -d \
  --name circe-bot \
  --env-file .env \
  -p 8787:8787 \
  circe-bot
```

---

## 5. Kubernetes Deployment

### Gateway WebSocket Mode

Gateway connections are stateful single sessions per bot token; run with `replicas: 1`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: circe-bot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: circe-bot
  template:
    metadata:
      labels:
        app: circe-bot
    spec:
      containers:
        - name: bot
          image: my-registry/circe-bot:latest
          command: ["npx", "circe", "start"]
          envFrom:
            - secretRef:
                name: circe-bot-secrets
```

### HTTP Webhook Mode

In HTTP mode, interactions are stateless and can scale horizontally behind a Service and Ingress with TLS termination:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: circe-webhook-bot
spec:
  replicas: 3
  selector:
    matchLabels:
      app: circe-webhook-bot
  template:
    metadata:
      labels:
        app: circe-webhook-bot
    spec:
      containers:
        - name: bot
          image: my-registry/circe-bot:latest
          command: ["npx", "circe", "start"]
          ports:
            - containerPort: 8787
          envFrom:
            - secretRef:
                name: circe-bot-secrets
---
apiVersion: v1
kind: Service
metadata:
  name: circe-webhook-service
spec:
  selector:
    app: circe-webhook-bot
  ports:
    - port: 80
      targetPort: 8787
```

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

