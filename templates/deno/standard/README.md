# Circe Bot (Standard - Deno)

A modular, production-ready Discord bot built on [Circe](https://github.com/sxnnyside-project/circe) and Deno.

## Features

- **File-based Routing**: Autodiscovery for commands, components, and events
- **Localization**: Built-in multi-language translation and string interpolation
- **Observability**: Health checks (`/health`), structured logging, and unified error handling
- **Zero Configuration Setup**: Native TypeScript execution with Deno tasks

## Getting Started

1. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. Run in development mode:
   ```bash
   deno task dev
   ```

## Production

Run your bot in production:
```bash
deno task start
```

