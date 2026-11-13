# Circe Bot (Advanced - Node.js)

A production-ready Discord bot built on [Circe](https://github.com/sxnnyside-project/circe) and Node.js 22+.

## Features

- **Nested Subcommand Groups**: Structured modular commands (`/admin kick`, etc.)
- **Context Menus**: User and message context menu interactions
- **Modals & Components**: Interactive modals, select menus, buttons, and stateful pagination
- **Guard Pipelines**: Role/permission verification and cooldown stores
- **Production Observability**: Health checks, structured logging, and telemetry-safe error boundaries
- **Container Ready**: Production multi-stage Dockerfile for Coolify and Docker environments

## Getting Started

1. Copy `.env.example` to `.env` and fill in your bot credentials:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

## Production

Build and start the application:
```bash
npm run build
npm run start
```

