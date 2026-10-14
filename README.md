# Circe

![Version](https://img.shields.io/badge/version-1.1.0-orange)
![License](https://img.shields.io/badge/License-MIT-green)
[![CI](https://github.com/sxnnyside-project/circe/workflows/CI/badge.svg)](https://github.com/sxnnyside-project/circe/actions)

<p align="center">
  <strong>Inversion of Control ✦ Dual-Transport (Gateway & HTTP) ✦ Cross-Runtime</strong><br>
  <em>The TypeScript Discord application framework with file-system conventions for Bun, Node.js 22+, and Deno.</em>
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

**Circe** is an inversion-of-control application framework for Discord bots, built on top of `discord.js`.

Most Discord bot stacks in TypeScript are built as imperative scripts. Developers manually instantiate a client, write custom filesystem loaders to discover commands, handle nested subcommands with repetitive switch statements, parse dynamic `customId` strings with manual string splitting, and maintain 24/7 stateful WebSocket Gateway connections when stateless HTTP Webhooks would suffice. As bots scale, this glue code accumulates and fails silently at runtime.

Circe eliminates this boilerplate by inverting process control: the `circe` CLI owns the application lifecycle, discovers commands and event listeners by directory convention, validates module shapes at scan-time with compiler-grade diagnostics, and routes interactions over Gateway WebSockets, serverless HTTP Webhooks, or hybrid mode without modifying a single line of interaction logic.

### Philosophy

> _"Infrastructure should be boring, shared, and derived from what bots actually need."_

This is a Sxnnyside Project, part of the ecosystem's shared infrastructure.

## Features

- **Inversion of Control CLI**: The `circe` binary owns project scaffolding (`circe init`), startup, hot-reloading development (`circe dev`), production execution (`circe start`), and CI pre-flight contract verification (`circe build`).
- **File-System Conventions**: Automatic discovery for `commands/`, `command-groups/`, `context-menus/`, `events/`, `components/`, and `modals/` with scan-time shape validation.
- **Dual-Transport Architecture**: Switch seamlessly between WebSocket Gateway, stateless HTTP Webhooks, or hybrid mode directly in `circe.config.ts`.
- **Sub-Millisecond Ed25519 Web Crypto**: Zero-dependency request signature verification using native `crypto.subtle.verify` on Bun, Node.js 22+, and Deno.
- **Hierarchical Subcommand Routing**: Automatic nested command tree assembly up to Discord's two-level limit with inherited group-level guards and unified tracing.
- **Typed Component Routes & Pagination**: Expressive URL-style route patterns (`pattern: "ticket:close:[ticketId]:[action]"`) with full type inference, plus collector-free pagination (`createPaginator`) with optional dropdown navigation (`pageSelect`).
- **Enterprise Observability & Guards**: Built-in composable `cooldown()` guards (memory or SQLite), correlation IDs via `AsyncLocalStorage`, and global `onError` error reporting.

## Installation

### Prerequisites

- [Bun](https://bun.sh) (`>=1.4.0`), [Node.js](https://nodejs.org) (`>=22.18.0`, the first release that runs TypeScript natively), or [Deno](https://deno.com) (`>=2.0.0`)
- `discord.js` (`^14.16.0`) peer dependency

### Package Managers

```bash
# Bun (Recommended)
bun add @sxnnyside/circe discord.js zod

# npm
npm install @sxnnyside/circe discord.js zod

# pnpm
pnpm add @sxnnyside/circe discord.js zod

# Yarn (Classic 1.x, or Berry 4.x with node-modules or Plug'n'Play)
yarn add @sxnnyside/circe discord.js zod

# Deno
deno add npm:@sxnnyside/circe npm:discord.js npm:zod
```

CI installs the packed tarball with npm, pnpm, Yarn Classic and Yarn Berry (both linkers) and checks that the `circe` binary and the entry points load. Yarn Classic prints `The engine "bun" appears to be invalid`; it is harmless, because `engines.bun` is only a hint for Bun users.

### From Source

```bash
git clone https://github.com/sxnnyside-project/circe.git
cd circe
bun install
```

## Usage

Define your bot configuration at `circe.config.ts`:

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

Create a command in `src/commands/ping.ts`:

```ts
import { defineCommand } from "@sxnnyside/circe";
import { SlashCommandBuilder } from "discord.js";

export default defineCommand({
  builder: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong"),
  async execute(ctx) {
    await ctx.interaction.reply("Pong!");
  },
});
```

Run the bot via the Circe CLI:

```bash
# Scaffold a new project starter
bun x circe init

# Development with hot-reload on file changes
bun x circe dev

# Production runner
bun x circe start

# Pre-flight contract verification in CI
bun x circe build
```

## Architecture

```
circe/
├── src/               # Framework core (CLI, transport, runtime adapters, loaders, routers)
├── tests/             # Comprehensive behavioral test suites (Gateway, Webhook, CLI, routing)
└── docs/              # Architectural specifications and module contracts
```

For a detailed breakdown of specifications and contracts, see [docs/architecture/](docs/architecture/).

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
