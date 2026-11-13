# Circe Bot (Bun Standard)

A production-ready Discord bot project built with **Circe** and **Bun**.

## Features

- **Lifecycle & Health Probes:** Built-in `/health` (liveness) and `/ready` (readiness) on port 8080.
- **Convention-based routing:** Commands in `src/commands/`, events in `src/events/`, components in `src/components/`.
- **Localization:** Dynamic string translation via `src/localization.ts` with `ctx.t`.
- **Error Boundary:** Isolated error handling via `src/error.ts`.
- **Middleware:** Request lifecycle hooks via `src/middleware.ts`.

## Getting Started

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure your bot:**
   ```bash
   cp .env.example .env
   # Add your bot token to .env
   ```

3. **Start local development:**
   ```bash
   bun run dev
   ```

4. **Production run:**
   ```bash
   bun run start
   ```

## Probes

- `GET http://localhost:8080/health` -> `{"status":"alive"}`
- `GET http://localhost:8080/ready` -> `{"status":"ready","checks":{"memory":"ok"}}`

