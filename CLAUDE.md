# Circe — repository guide for AI agents

## What this is

Circe is a TypeScript/Bun-first Discord bot framework built on `discord.js`, for the Sxnnyside Project ecosystem. It provides shared infrastructure — process lifecycle, a declarative CLI, configuration, logging, correlation context, error handling, commands (including subcommand groups and context menus), events, components (buttons/selects, with a built-in paginator), modals, guards, i18n, cross-runtime HTTP transport, observability hooks, and testing utilities — so individual bots don't reimplement the same plumbing. Circe contains **no application/business logic**: no persistence, no moderation rules, no bot-specific authorization policy, no i18n content.

## Topology

**Monolithic.** One package (`@sxnnyside/circe`), four publishable entry points — `circe` (main), `circe/testing`, `circe/cli`, and `circe/bun-sqlite` (isolated so importing the main package never pulls in `bun:sqlite` on Node/Deno) — plus the `circe` CLI binary. No workspace/monorepo tooling.

## Stack

TypeScript, Bun (primary runtime + package manager, with first-class Node 22+ and Deno 2+ support — see `docs/architecture/runtime-strategy.md`), `discord.js` (peer dependency — never bundled, see below), Zod (config schema validation), Biome (lint + format), Husky + lint-staged (pre-commit), `bun:test` (test runner — Bun-native, not Vitest; see rationale below).

## Two ways to run a bot

1. **CLI-driven (Inversion of Control, the primary path)**: the bot declares a `circe.config.ts` (via `defineCirceConfig`) and runs `circe start` / `circe dev` / `circe build`. The CLI owns process startup, scanning, and login — see `docs/architecture/ioc-model.md` and `docs/architecture/config-contract.md`. `circe init` scaffolds a new project with this shape.
2. **Programmatic escape hatch**: `createCirce({...})` plus manual `.load()`/`.start()` calls, for bots that need control the declarative config can't express. Fully equivalent — the CLI path is sugar over this one, not a separate implementation.

## Command surface

Every command is available two ways — `just <recipe>` if `just` is installed, or `bun run <script>` directly. They call the same thing.

```
install         bun install
dev             bun run --watch src/index.ts   (Circe's own dev loop, not a bot's)
build           bun build (4 entry points) + tsc --emitDeclarationOnly
test            bun test
test:coverage   bun test --coverage, filtered to src/ and gated at 85% lines / 75% functions
typecheck       tsc --noEmit
lint            biome lint .
format          biome format --write .
check           biome check . && typecheck && test:coverage && build   — the full gate, same as CI
clean           rm -rf dist
```

The `circe` CLI binary (what a *consuming bot* runs) is separate from the scripts above: `circe init | circe start | circe dev | circe build`.

## Architecture

```
src/
├── application/     # lifecycle state machine, createCirce() wiring, onStart/onStop hooks,
│                     # middleware, and the error-boundary escape hatch
├── cli/              # circe init/start/dev/build — the IoC entry point; prepare-app.ts is the
│                     # shared "load config, scan modules" path start/build both call
├── config/           # defineConfig() (bot's env schema) + defineCirceConfig() (circe.config.ts
│                     # contract) + integration.ts (the sole circe.config.ts extension point)
├── logging/          # structured logger + AsyncLocalStorage correlation IDs
├── errors/           # CirceError base + ModuleValidationError/DiscoveryConflictError + normalizeError()
├── i18n/             # I18nResolver contract + IdentityI18nResolver default (verbatim passthrough)
├── observability/    # ErrorReporter telemetry hook, decoupled from user-facing reply-shaping hooks
├── runtime/           # detectRuntime() (Bun/Node/Deno feature detection) + the dev-mode file watcher
├── transport/         # HTTP Interactions Endpoint: signature verification, the discord.js
│                     # InteractionCreate bridge, the portable fetch handler, and Bun/Node/Deno servers
├── discord/
│   ├── module-loader.ts     # shared directory-scan/import helper, aggregates errors (never fail-fast)
│   ├── commands/             # types, registry, loader, Discord registration, interaction router,
│   │   └── groups/            # autocomplete routing, and command-groups/ subcommand trees
│   ├── context-menus/        # user & message context-menu commands
│   ├── events/               # types, registry, loader, dispatcher (correlation + error isolation)
│   ├── components/           # types, registry (longest-prefix match), loader, interaction router,
│   │   └── pagination/         # pattern.ts (typed customId patterns), and the built-in paginator
│   ├── modals/               # types, registry, loader, interaction router
│   └── guards/               # guildOnly, hasPermission, cooldown (memory + bun:sqlite stores) —
│                             # mechanism only, never policy
├── testing/          # circe/testing subpath: testCommand/testComponent/testModal/testEvent,
│                     # exercising the real router code against hand-built interaction stubs
└── index.ts
```

`tests/` mirrors `src/` exactly, one test file per source file plus a few integration-style files (`application/app.test.ts` exercises the full `createCirce()` wiring with `autoLogin`/`handleProcessSignals` disabled and an injected REST stub — no live Discord connection, ever; `tests/transport/deno-runtime.test.ts` spawns a real `deno` subprocess, skipped automatically when Deno isn't installed).

## Conventions and rules

- **`discord.js` is a peer dependency, always built with `--external discord.js`.** Never move it to `dependencies` or let it get bundled into `dist` — a bundled copy would give consuming bots two different `GuildMember`/`Client` classes, silently breaking every `instanceof` check in the router and guards.
- **Circe stays below the application layer.** If a change would encode a bot's business decision (which permission bits map to "staff," what a command does, how errors are branded) rather than generic Discord/process infrastructure, it doesn't belong here — it belongs in the bot consuming Circe.
- **No dependency injection container, no plugin system, no event bus, no persistence layer.** discord.js's own `EventEmitter` is the only event dispatch mechanism; `dispatcher.ts` wraps handlers for correlation/error-isolation, it does not route between them. `config/integration.ts`'s `{ name, setup(context) }` shape is the one deliberate extension point, and it only grants `onStart`/`onStop` hooks and extra scan roots — not a general plugin API.
- **`bun:test` over any other test runner, `bun build` + `tsc --emitDeclarationOnly` over any other bundler.** Both are the idiomatic, zero-extra-dependency choice for a Bun-native project — don't swap them in for a JS-ecosystem alternative without a concrete reason.
- **Every public API export goes through `src/index.ts` (or `src/testing/index.ts`, `src/cli/index.ts`, `src/bun-sqlite.ts`).** If something needs exposing to consumers, add it there explicitly — don't rely on deep imports.
- **`bun:sqlite`-backed code never leaks into the main entry point.** It lives behind the `@sxnnyside/circe/bun-sqlite` subpath specifically so importing `@sxnnyside/circe` on Node or Deno never triggers an eager-evaluation module resolution error.
- **HTTP transport reuses discord.js's own internal interaction pipeline.** `transport/interaction-bridge.ts` feeds a verified raw webhook payload into `client.actions.InteractionCreate.handle()` (a real, if TS-`private`, discord.js API) so every router (commands/components/modals/context-menus) needs zero changes regardless of transport — gateway and HTTP interactions converge on the same code path.
- **Comments explain *why*, not *what* or *when*.** Don't reference implementation history, prior designs, or how a piece of code came to be — only the current reasoning a maintainer needs to make a safe change. If a comment would only make sense to someone who watched the code get written, rewrite it or delete it.
- **No speculative abstraction.** Every module here should be traceable to an actual, demonstrated need (evidence from real bot code or a real defect), not "this might be useful later."
- **The router never hardcodes a bot's presentation policy without an escape hatch.** `onUnknownCommand`/`onGuardDenied`/`onCommandError` (and their component/modal-router equivalents) let a bot fully own reply content and shape (embeds, localization, ephemeral or not); the built-in defaults are a fallback, not the only option. The paginator's button emoji/label follow the same rule — sensible defaults, always overridable. Autocomplete is the one exception — Discord's protocol only accepts a choice list on failure, so there's no content to make configurable there; an empty list is the only safe fallback.
- **Command/event/component/modal discovery is recursive.** `discoverModules` walks subdirectories — bots are free to organize into category folders or keep them flat. Discovery never fails on the first bad file: every category loader aggregates all validation issues into one `ModuleValidationError`, and duplicate/missing-identity conflicts raise `DiscoveryConflictError` — both from `src/errors/`.
- **Component routing matches by `customId` prefix, longest match wins.** `"crate:"` and `"crate:save:"` can coexist as separate, valid registrations — only an exact duplicate prefix is rejected. `defineComponent({ pattern })` compiles a path-like pattern string into that prefix plus a typed `parse()` at definition time (see `components/pattern.ts`) — don't add a second matching strategy (exact match, regex, etc.) without a demonstrated need.
- **A command's `autocomplete` handler calls `ctx.interaction.respond(...)` itself**, the same way `execute` calls `ctx.interaction.reply(...)` — Circe doesn't invent a return-value convention discord.js doesn't have.
- **`onStart` hooks always run before login and command registration; `onStop` hooks always run after the client is destroyed.** This ordering is enforced by `app.start()`/`app.stop()` themselves, not by hook registration order — don't reintroduce a design where it depends on when the bot happens to call `app.onStart()`/`app.onStop()`.

## Testing

Run `bun test` (or `bun run test:coverage` for the gated coverage report) or `just test`. Tests never require a live Discord connection — router/dispatcher tests use hand-built interaction/event stubs (or the fixtures in `src/testing/`), and `createCirce()` accepts `autoLogin: false` plus an injectable REST client specifically so the full app-wiring path is testable without a gateway connection. `scripts/coverage.ts` filters `bun test --coverage`'s lcov output down to `src/` before computing the gate — Bun 1.4's `coveragePathIgnorePatterns` bunfig option doesn't actually filter anything as of this writing, so don't rely on it; the script's own comment explains the workaround.

## What NOT to add here

Persistence/ORM, dependency injection, event bus, business logic, i18n content, music/moderation/voice systems, bot-specific authorization policy, a general plugin ecosystem, sharding infrastructure, deployment automation beyond the existing HTTP transport adapters. If a task asks for one of these inside Circe, stop and flag it rather than implementing it — it means either the task is misscoped or it belongs in a consuming bot instead.
