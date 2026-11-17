# Circe

![Circe banner](https://raw.githubusercontent.com/sxnnyside-project/circe/main/docs/assets/circe-banner.png)

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)
[![CI](https://github.com/sxnnyside-project/circe/actions/workflows/ci.yml/badge.svg)](https://github.com/sxnnyside-project/circe/actions/workflows/ci.yml)
![Platform](https://img.shields.io/badge/platform-Bun%20%7C%20Node.js%20%7C%20Deno-lightgrey)
[![npm](https://img.shields.io/npm/v/@sxnnyside/circe)](https://www.npmjs.com/package/@sxnnyside/circe)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2)](https://discord.gg/h3hhNY8VTE)
[![Patreon](https://img.shields.io/badge/Patreon-SxnnysideProject-F96854)](https://patreon.com/SxnnysideProject)

<p align="center">
  <strong>Inversion of Control ✦ Dual-Transport (Gateway & HTTP) ✦ Cross-Runtime</strong><br>
  <em>The TypeScript Discord application framework with file-system conventions for Bun, Node.js 22+, and Deno.</em>
</p>

<p align="center">
  <a href="#about">About</a> ✦
  <a href="#features">Features</a> ✦
  <a href="#installation">Installation</a> ✦
  <a href="#usage">Usage</a> ✦
  <a href="#api">API</a> ✦
  <a href="#architecture">Architecture</a> ✦
  <a href="#contributing">Contributing</a>
</p>

---

## About

**Circe** is an inversion-of-control application framework for Discord bots, built on top of `discord.js`. Part of the Sxnnyside Project ecosystem.

Most Discord bot stacks in TypeScript are built as imperative scripts. Developers manually instantiate a client, write custom filesystem loaders to discover commands, handle nested subcommands with repetitive switch statements, parse dynamic `customId` strings with manual string splitting, and maintain 24/7 stateful WebSocket Gateway connections when stateless HTTP Webhooks would suffice. As bots scale, this glue code accumulates and fails silently at runtime.

Circe eliminates this boilerplate by inverting process control: the `circe` CLI owns the application lifecycle, discovers commands and event listeners by directory convention, validates module shapes at scan-time with compiler-grade diagnostics, and routes interactions over Gateway WebSockets, serverless HTTP Webhooks, or hybrid mode without modifying a single line of interaction logic.

### Philosophy

> _"Infrastructure should be boring, shared, and derived from what bots actually need."_

This is a Sxnnyside Project, part of the ecosystem's shared infrastructure.

## Features

- **Inversion of Control CLI Suite**: The `circe` binary owns project scaffolding (`circe init`), startup, hot-reloading development (`circe dev`), production execution (`circe start`), CI contract verification (`circe build`), diagnostic health checks (`circe doctor`), interactive route inspection (`circe routes`), and convention-driven code generation (`circe add`).
- **File-System Conventions**: Automatic discovery for `commands/`, `command-groups/`, `context-menus/`, `events/`, `components/`, and `modals/` with compile-time shape validation and single-file hooks (`middleware.ts`, `error.ts`, `localization.ts`).
- **Dual-Transport Architecture**: Switch seamlessly between WebSocket Gateway, stateless HTTP Webhooks, or hybrid mode directly in `circe.config.ts`.
- **Sub-Millisecond Ed25519 Web Crypto**: Zero-dependency request signature verification using native `crypto.subtle.verify` on Bun, Node.js 22+, and Deno.
- **Universal Multi-Runtime SQLite**: Native `bun:sqlite` under Bun and standard library `node:sqlite` (`DatabaseSync`) under Node.js 22.18+ and Deno 2.2+ via `@sxnnyside/circe/sqlite`.
- **Hierarchical Subcommand Routing**: Automatic nested command tree assembly up to Discord's two-level limit with inherited group-level guards and unified tracing.
- **Typed Component Routes & Pagination**: Expressive URL-style route patterns (`pattern: "ticket:close:[ticketId]:[action]"`) with full type inference, plus collector-free pagination (`createPaginator`) with optional dropdown navigation (`pageSelect`).
- **Explicit Resource Management (ERM)**: Native `Symbol.asyncDispose` on `createCirce()` and `Symbol.dispose` on stores for clean deterministic scoping (`await using app = createCirce(...)`).
- **Enterprise Observability & Golden Signals**: Built-in composable `cooldown()` guards, `AsyncLocalStorage` correlation IDs, error telemetry (`onError`), and sliding-window latency statistics (`onInteractionComplete`).

## Installation

### Prerequisites

- [Bun](https://bun.sh) (`>=1.4.0`), [Node.js](https://nodejs.org) (`>=22.18.0`), or [Deno](https://deno.com) (`>=2.0.0`, Deno SQLite `>=2.2.0`)
- `discord.js` (`^14.16.0 || ^14.28.0`) peer dependency
- `zod` (`^3.24.0 || ^4.0.0`) peer dependency

### Install

Install `@sxnnyside/circe` and required peer dependencies across any supported runtime or package manager:

```bash
# Bun
bun add @sxnnyside/circe discord.js zod

# Node.js (npm)
npm install @sxnnyside/circe discord.js zod

# Node.js (pnpm)
pnpm add @sxnnyside/circe discord.js zod

# Node.js (Yarn)
yarn add @sxnnyside/circe discord.js zod

# Deno
deno add npm:@sxnnyside/circe npm:discord.js npm:zod
```

CI installs the packed tarball across npm, pnpm, Yarn Classic, and Yarn Berry (both linkers) to verify the binary and all subpath exports.

### CLI Execution

Execute the `circe` CLI directly across runtimes without global installation:

```bash
# Bun
bun x @sxnnyside/circe <command>

# Node.js (npx)
npx @sxnnyside/circe <command>

# Deno
deno run -A npm:@sxnnyside/circe/cli <command>
```

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
# Scaffold a new project starter in an empty folder:
bun x @sxnnyside/circe init --standard
# Or on Node.js:
npx @sxnnyside/circe init --standard
# Or on Deno:
deno run -A npm:@sxnnyside/circe/cli init --standard

# Run pre-flight health diagnostics
bun x circe doctor

# Inspect discovered command routes and component patterns
bun x circe routes

# Scaffold a new command, event, component, or modal
bun x circe add command ban --description "Bans a user" --guild-only

# Development with hot-reload on file changes
bun x circe dev

# Production runner
bun x circe start

# Pre-flight contract verification in CI
bun x circe build
```

## API

Circe exposes a modular TypeScript API across its entry points:

### Core (`@sxnnyside/circe`)

```ts
import {
  defineCirceConfig,
  defineConfig,
  defineCommand,
  defineCommandGroup,
  defineSubcommand,
  defineContextMenu,
  defineEvent,
  defineComponent,
  defineModal,
  defineGuard,
  defineMiddleware,
  defineLocalizationResolver,
  createCirce,
  createPaginator,
  detectRuntime,
  guildOnly,
  hasPermission,
  cooldown,
} from "@sxnnyside/circe";
```

- **Application Lifecycle**: `defineCirceConfig`, `defineConfig`, `createCirce`, `detectRuntime`
- **Route Definitions**: `defineCommand`, `defineCommandGroup`, `defineSubcommand`, `defineContextMenu`, `defineEvent`, `defineComponent`, `defineModal`
- **Execution Gates**: `defineGuard`, `defineMiddleware`, `guildOnly`, `hasPermission`, `cooldown`
- **Localization**: `defineLocalizationResolver`, `localizationContextOf`, `createTranslator`, `resolveInteractionLocale`, `interpolate`
- **Interactive UI**: `createPaginator`

### SQLite Persistence (`@sxnnyside/circe/sqlite`)

```ts
import { SqliteCooldownStore } from "@sxnnyside/circe/sqlite";
```

- Multi-runtime zero-copy SQLite cooldown store backed by `bun:sqlite` on Bun and standard library `node:sqlite` (`DatabaseSync`) on Node.js 22.18+ and Deno 2.2+.

### Test Harness (`@sxnnyside/circe/testing`)

```ts
import {
  testCommand,
  testComponent,
  testModal,
  testContextMenu,
  testAutocomplete,
  createTestInteraction,
} from "@sxnnyside/circe/testing";
```

- Offline interaction simulation and assertions for unit testing without live Discord connections.

For detailed specifications, contracts, and guides, see the [Architecture Documentation](docs/architecture/).

## Architecture

For a detailed breakdown, see [ARCHITECTURE.md](ARCHITECTURE.md).

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
