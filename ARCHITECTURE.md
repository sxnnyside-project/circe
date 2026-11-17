# Architecture

## Overview

Circe is an inversion-of-control application framework for Discord bots, built on top of `discord.js`. It eliminates imperative bot boilerplate by providing process lifecycle ownership, file-system discovery conventions, dual-transport routing (WebSocket Gateway and HTTP Webhooks), cross-runtime support (Bun, Node.js 22+, Deno 2+), and native SQLite persistence without runtime dependencies.

### Architectural Specifications

Authoritative subsystem contracts and design specifications are documented in:

- **[Inversion of Control Model](docs/architecture/ioc-model.md)**: Process execution lifecycle, CLI state machine (`dev`, `start`, `build`, `doctor`), graceful shutdown signal handling, and declarative application bootstrapping.
- **[Runtime Strategy](docs/architecture/runtime-strategy.md)**: Feature detection across Bun, Node.js 22+, and Deno 2+, native Ed25519 Web Crypto signature verification, and zero-dependency multi-runtime SQLite (`bun:sqlite` vs `node:sqlite`).
- **[Configuration Contract](docs/architecture/config-contract.md)**: Declarative `circe.config.ts` interface, Zod environment validation (`defineConfig`), scan-time validation, and integration extension points.
- **[Folder Conventions](docs/architecture/folder-conventions.md)**: Directory layout conventions (`commands/`, `command-groups/`, `context-menus/`, `events/`, `components/`, `modals/`), naming rules, and recursive scanner behavior.
- **[Module Contracts](docs/architecture/module-contracts.md)**: Compiler-grade shape validation for slash commands, subcommand groups, context menus, interaction components, modals, and single-file hooks (`middleware.ts`, `error.ts`, `localization.ts`).
- **[Error Taxonomy](docs/architecture/error-taxonomy.md)**: Unified authoring-time error taxonomy, module validation issues, discovery conflicts, structured CLI error reporting (`--format json`), and diagnostic exit codes.
- **[Deployment Specifications](docs/deployment/README.md)**: Production execution, Docker containers, and environment guidelines for [Bun](docs/deployment/bun.md), [Node.js](docs/deployment/node.md), and [Deno](docs/deployment/deno.md).
- **[Transport Benchmarks](docs/benchmarks.md)**: Empirical HTTP interaction latency and throughput benchmarks comparing Bun, Node.js, and Deno HTTP bridges.

## Components

| Component | Responsibility | Relevant Specification |
|---|---|---|
| `cli/` | Command-line interface suite (`init`, `dev`, `start`, `build`, `doctor`, `routes`, `manifest`, `add`) | [ioc-model.md](docs/architecture/ioc-model.md) |
| `application/` | Process lifecycle state machine, `createCirce()` container, middleware chain, and error boundaries | [ioc-model.md](docs/architecture/ioc-model.md), [error-taxonomy.md](docs/architecture/error-taxonomy.md) |
| `config/` | Schema validation (`defineConfig`, `defineCirceConfig`), environment loading, and integration hooks | [config-contract.md](docs/architecture/config-contract.md) |
| `discord/commands/` | Slash command registry, autocomplete routing, and hierarchical subcommand tree assembly | [module-contracts.md](docs/architecture/module-contracts.md), [folder-conventions.md](docs/architecture/folder-conventions.md) |
| `discord/components/` | Button and select menu routing, longest-prefix matching, typed customId pattern parsing, and pagination | [module-contracts.md](docs/architecture/module-contracts.md) |
| `discord/modals/` | Modal submission registry, validation, and interaction routing | [module-contracts.md](docs/architecture/module-contracts.md) |
| `discord/events/` | Event registration and dispatch with correlation IDs and error isolation | [module-contracts.md](docs/architecture/module-contracts.md) |
| `discord/guards/` | Composable authorization and execution gates (`guildOnly`, `hasPermission`, `cooldown`) | [module-contracts.md](docs/architecture/module-contracts.md) |
| `transport/` | Ed25519 signature verification, HTTP webhook ingress, and interaction dispatch bridge | [runtime-strategy.md](docs/architecture/runtime-strategy.md), [benchmarks.md](docs/benchmarks.md) |
| `localization/` | Localization context, translator factory, and official Discord locale resolution | [module-contracts.md](docs/architecture/module-contracts.md) |
| `health/` | Kubernetes-style liveness (`/health/liveness`) and readiness (`/health/readiness`) probes | [config-contract.md](docs/architecture/config-contract.md) |
| `sqlite/` | Zero-dependency multi-runtime SQLite cooldown store (`bun:sqlite` or `node:sqlite`) | [runtime-strategy.md](docs/architecture/runtime-strategy.md) |
| `testing/` | Offline test harness (`testCommand`, `testComponent`, `testModal`, `testContextMenu`) | [module-contracts.md](docs/architecture/module-contracts.md) |

## Data flow

1. **Ingress**: An interaction arrives via WebSocket Gateway (`InteractionCreate` event) or stateless HTTP Webhook (`POST /interactions`).
2. **Verification & Bridge**: For HTTP transport, Ed25519 signatures are verified via Web Crypto before dispatching into `discord.js`'s internal interaction pipeline ([runtime-strategy.md](docs/architecture/runtime-strategy.md)).
3. **Correlation & Telemetry**: `AsyncLocalStorage` assigns a unique request ID to the interaction and begins high-resolution latency tracking.
4. **Middleware & Guards**: Global middleware and route-level guards (`guildOnly`, permissions, cooldowns) execute sequentially. If denied, `onGuardDenied` responds and execution terminates cleanly.
5. **Route Execution**: The interaction is routed to the matching command, subcommand, component prefix/pattern, modal, or context menu handler ([folder-conventions.md](docs/architecture/folder-conventions.md)).
6. **Error Boundary & Metrics**: Successful executions record sliding-window latency metrics; unhandled exceptions are caught by `onError` / `onCommandError` boundaries without crashing the process ([error-taxonomy.md](docs/architecture/error-taxonomy.md)).

## Decisions

| Decision | Why | Alternatives rejected | Relevant Specification |
|---|---|---|---|
| Inversion of Control (IoC) | Framework CLI owns startup, scanning, and process signals so bot authors focus exclusively on interaction logic | Imperative script bootstrapping (`new Client()`) | [ioc-model.md](docs/architecture/ioc-model.md) |
| Peer `discord.js` dependency | Prevents dual-instance symbol collisions and broken `instanceof` checks in consuming bots | Bundling `discord.js` into framework distribution | [runtime-strategy.md](docs/architecture/runtime-strategy.md) |
| Zero runtime npm dependencies | Maximum security, deterministic installations, and minimal surface attack area | External utility and routing libraries | [runtime-strategy.md](docs/architecture/runtime-strategy.md) |
| Dual-Transport bridge | Unified interaction handlers work identically over WebSocket Gateway and stateless HTTP Webhooks | Separate APIs for Gateway vs Webhooks | [runtime-strategy.md](docs/architecture/runtime-strategy.md) |
| Native multi-runtime SQLite | Native performance on Bun (`bun:sqlite`) and Node/Deno (`node:sqlite`) with zero third-party drivers | `better-sqlite3`, `sqlite3` npm packages | [runtime-strategy.md](docs/architecture/runtime-strategy.md) |
| Longest-prefix component routing | Enables modular URL-like `customId` routing without regex collision ambiguity | Exact string matching, regex routers | [folder-conventions.md](docs/architecture/folder-conventions.md) |

## Constraints

- `discord.js` is always external and never bundled into `dist/`.
- Zero npm runtime dependencies (only peer dependencies `discord.js` and `zod`).
- Engine floors: Bun >= 1.4.0, Node.js >= 22.18.0, Deno >= 2.0.0 (Deno SQLite >= 2.2.0) — see [runtime-strategy.md](docs/architecture/runtime-strategy.md).
- Explicit Resource Management (`Symbol.asyncDispose` and `Symbol.dispose`) across stores and application containers.
- All exported public APIs must route through `src/index.ts`, `src/testing.ts`, `src/cli.ts`, or `src/sqlite.ts`.
