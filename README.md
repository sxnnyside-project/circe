# Circe

![Version](https://img.shields.io/badge/version-0.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)
[![CI](https://github.com/sxnnyside-project/circe/workflows/CI/badge.svg)](https://github.com/sxnnyside-project/circe/actions)

<p align="center">
  <strong>TypeScript-first ✦ Bun-native ✦ Infrastructure, not opinions</strong><br>
  <em>A shared Discord bot framework built on discord.js.</em>
</p>

<p align="center">
  <a href="#about">About</a> ✦
  <a href="#features">Features</a> ✦
  <a href="#installation">Installation</a> ✦
  <a href="#usage">Usage</a> ✦
  <a href="#architecture">Architecture</a> ✦
  <a href="#contributing">Contributing</a>
</p>

---

## About

**Circe** is a TypeScript/Bun-first framework for building Discord bots, built on top of `discord.js`.

It provides the shared infrastructure a Discord bot needs — lifecycle, configuration, structured logging, correlation context, command/event handling, and error handling — so that bots don't each reimplement the same plumbing independently.

It sits strictly below the application layer: it provides framework/infrastructure primitives, never business logic, moderation rules, or bot-specific behavior. Its public API is not yet considered stable.

### Philosophy

> _"Infrastructure should be boring, shared, and derived from what bots actually need."_

This is a Sxnnyside Project repository, part of the ecosystem's shared tooling.

## Features

- **Lifecycle State Machine**: Explicit `created → starting → running → stopping → stopped` runtime flow with graceful shutdown, idempotent stop, and default process-level signal/crash handling.
- **Structured Logging**: Leveled logging with structured output (pretty console in development, JSON in production) and configurable sinks.
- **Correlation IDs**: Transparent `AsyncLocalStorage` context propagation, automatically attaching correlation IDs to all logs generated during commands and events.
- **Config Validation**: `defineConfig()` maps and validates environment variables against a bot-supplied Zod schema before gateway connection.
- **Command Registry**: Dynamic folder-based command loading supporting nested category directories, auto-registration, and guard verification.
- **Event Dispatcher**: Typed event listeners with isolated error boundaries preventing single handler failures from crashing the client.
- **Composable Guards**: Composable execution preconditions (`guildOnly`, `hasPermission`) to validate contexts before running handlers.
- **Testing Harness**: Dedicated testing subpath (`@sxnnyside/circe/testing`) with mocked interactions and events to test bot code offline.

## Installation

### Prerequisites

- [Bun](https://bun.sh) (`>=1.2.0`)
- `discord.js` (`^14.16.0` (peer dependency — installed by the consuming bot))

### From Source

```bash
git clone https://github.com/sxnnyside-project/circe.git
cd circe

bun install
```

## Usage

Create a bot entrypoint:

```ts
import { createCirce, defineConfig } from "circe";
import { z } from "zod";

const config = defineConfig(
  z.object({
    token: z.string().min(1),
    clientId: z.string().min(1),
    guildId: z.string().optional(), // present → guild-scoped registration; absent → global
  }),
);

const app = createCirce({ config: config.load(), intents: [] });

await app.commands.load(new URL("./commands", import.meta.url));
await app.events.load(new URL("./events", import.meta.url));
await app.start();
```

Write a command (e.g., `commands/utility/ping.ts`):

```ts
import { defineCommand } from "circe";
import { SlashCommandBuilder } from "discord.js";

export default defineCommand({
  builder: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Ping the bot"),
  async execute(ctx) {
    await ctx.interaction.reply("Pong!");
  },
});
```

Test your command in isolation (`tests/ping.test.ts`):

```ts
import { testCommand } from "circe/testing";
import pingCommand from "../src/commands/utility/ping.js";

const result = await testCommand(pingCommand);
// Exercises the router, guards, and execute handler offline
```

## Architecture

```
circe/
├── src/          # Core framework modules and source code
├── tests/        # Unit tests mirroring the src/ directory
└── dist/         # Compiled output for publication
```

For a detailed breakdown, see [CLAUDE.md](CLAUDE.md).

## Contributing

Contributions are accepted. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Before contributing, read the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Circe</strong> — A Sxnnyside Project<br>
  <em>&copy; 2026 Sxnnyside Project</em>
</p>
