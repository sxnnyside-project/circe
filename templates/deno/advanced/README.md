# Circe Bot (Advanced - Deno)

A production-ready Discord bot built on [Circe](https://github.com/sxnnyside-project/circe) and Deno.

## Features

- **Nested Subcommand Groups**: Structured modular commands (`/admin kick`, etc.)
- **Context Menus**: User and message context menu interactions
- **Modals & Components**: Interactive modals, select menus, buttons, and stateful pagination
- **Guard Pipelines**: Role/permission verification and cooldown stores
- **Production Observability**: Health checks, structured logging, and telemetry-safe error boundaries
- **Deno-First**: Zero `package.json` overhead, native TypeScript execution, and multi-stage Dockerfile

## Getting Started

1. Copy `.env.example` to `.env` and fill in your bot credentials:
   ```bash
   cp .env.example .env
   ```

2. Run in development mode (hot-reloading enabled):
   ```bash
   deno task dev
   ```

## Production

Run your bot in production:
```bash
deno task start
```

