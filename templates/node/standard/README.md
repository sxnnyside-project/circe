# Circe Bot (Standard - Node.js)

A modular, production-ready Discord bot built with **Circe** and **Node.js 22+**.

## Features

- **File-based Routing**: Autodiscovery for commands, components, and events
- **Localization**: Built-in multi-language translation and string interpolation
- **Observability**: Health checks (`/health`), structured logging, and unified error handling

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

## Production

Verify and start:
```bash
npm run build
npm run start
```

