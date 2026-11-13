# Circe Bot (Bun Minimal)

A lightweight Discord bot built with **Circe** and **Bun**.

## Getting Started

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure your bot:**
   Copy `.env.example` to `.env` and set your Discord bot token:
   ```bash
   cp .env.example .env
   ```

3. **Run in development mode:**
   ```bash
   bun run dev
   ```

4. **Verify modules before deployment:**
   ```bash
   bun run build
   ```

## Project Structure

```
├── circe.config.ts    # Bot manifest and intents
├── .env.example       # Environment variable template
└── src/
    ├── config.ts      # Typed environment schema
    └── commands/      # Slash commands (ping.ts)
```

