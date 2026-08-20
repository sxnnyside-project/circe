# Circe — repository guide for AI agents

## What this is

Circe is a TypeScript/Bun-first Discord bot framework built on `discord.js`, for the Sxnnyside Project ecosystem. It provides shared infrastructure — lifecycle, configuration, logging, correlation context, error handling, commands, events, components, autocomplete, guards, and testing utilities — so individual bots don't reimplement the same plumbing. Circe contains **no application/business logic**: no persistence, no moderation rules, no bot-specific authorization policy, no i18n content.

## Topology

**Monolithic.** One package (`@sxnnyside/circe`), two publishable entry points (`circe` and `circe/testing`), no workspace/monorepo tooling.

## Stack

TypeScript, Bun (runtime + package manager), `discord.js` (peer dependency — never bundled, see below), Zod (config schema validation), Biome (lint + format), Husky + lint-staged (pre-commit), `bun:test` (test runner — Bun-native, not Vitest; see rationale below).

## Command surface

Every command is available two ways — `just <recipe>` if `just` is installed, or `bun run <script>` directly. They call the same thing.

```
install     bun install
dev         bun run --watch src/index.ts
build       bun build (two entry points) + tsc --emitDeclarationOnly
test        bun test
typecheck   tsc --noEmit
lint        biome lint .
format      biome format --write .
check       biome check . && typecheck && test && build   — the full gate, same as CI
clean       rm -rf dist
```

## Architecture

```
src/
├── application/    # lifecycle state machine + createCirce() wiring
├── config/         # defineConfig() — bot owns the schema, Circe owns validation
├── logging/        # structured logger + AsyncLocalStorage correlation IDs
├── errors/         # CirceError base + normalizeError()
├── discord/
│   ├── module-loader.ts   # shared directory-scan/import helper
│   ├── commands/           # types, registry, loader, Discord registration, interaction router, autocomplete routing
│   ├── events/             # types, registry, loader, dispatcher (correlation + error isolation)
│   ├── components/         # types, registry (longest-prefix match), loader, interaction router — buttons + select menus
│   └── guards/              # guildOnly, hasPermission — mechanism only, never policy
├── testing/         # circe/testing subpath: fixtures scoped to what Circe's own code reads
└── index.ts
```

`tests/` mirrors `src/` exactly, one test file per source file plus a few integration-style files (`application/app.test.ts` exercises the full `createCirce()` wiring with `autoLogin`/`handleProcessSignals` disabled and an injected REST stub — no live Discord connection, ever).

## Conventions and rules

- **`discord.js` is a peer dependency, always built with `--external discord.js`.** Never move it to `dependencies` or let it get bundled into `dist` — a bundled copy would give consuming bots two different `GuildMember`/`Client` classes, silently breaking every `instanceof` check in the router and guards.
- **Circe stays below the application layer.** If a change would encode a bot's business decision (which permission bits map to "staff," what a command does, how errors are branded) rather than generic Discord/process infrastructure, it doesn't belong here — it belongs in the bot consuming Circe.
- **No dependency injection container, no plugin system, no event bus, no persistence layer.** discord.js's own `EventEmitter` is the only event dispatch mechanism; `dispatcher.ts` wraps handlers for correlation/error-isolation, it does not route between them.
- **`bun:test` over any other test runner, `bun build` + `tsc --emitDeclarationOnly` over any other bundler.** Both are the idiomatic, zero-extra-dependency choice for a Bun-native project — don't swap them in for a JS-ecosystem alternative without a concrete reason.
- **Every public API export goes through `src/index.ts` (or `src/testing/index.ts`).** If something needs exposing to consumers, add it there explicitly — don't rely on deep imports.
- **Comments explain *why*, not *what* or *when*.** Don't reference implementation history, prior designs, or how a piece of code came to be — only the current reasoning a maintainer needs to make a safe change. If a comment would only make sense to someone who watched the code get written, rewrite it or delete it.
- **No speculative abstraction.** Every module here should be traceable to an actual, demonstrated need (evidence from real bot code or a real defect), not "this might be useful later."
- **The router never hardcodes a bot's presentation policy without an escape hatch.** `onUnknownCommand`/`onGuardDenied`/`onCommandError` (and their component-router equivalents `onUnknownComponent`/`onComponentError`) let a bot fully own reply content and shape (embeds, localization, ephemeral or not); the built-in defaults are a fallback, not the only option. Any new router/dispatcher behavior that produces a user-facing reply should follow the same pattern rather than hardcoding text. Autocomplete is the one exception — Discord's protocol only accepts a choice list on failure, so there's no content to make configurable there; an empty list is the only safe fallback.
- **Command/event/component discovery is recursive.** `discoverModules` walks subdirectories — bots are free to organize commands/events/components into category folders or keep them flat.
- **Component routing matches by `customId` prefix, longest match wins.** `"crate:"` and `"crate:save:"` can coexist as separate, valid registrations — only an exact duplicate prefix is rejected. Don't add a second matching strategy (exact match, regex, etc.) without a demonstrated need; prefix matching has covered every case so far.
- **A command's `autocomplete` handler calls `ctx.interaction.respond(...)` itself**, the same way `execute` calls `ctx.interaction.reply(...)` — Circe doesn't invent a return-value convention discord.js doesn't have.
- **`onStart` hooks always run before login and command registration; `onStop` hooks always run after the client is destroyed.** This ordering is enforced by `app.start()`/`app.stop()` themselves, not by hook registration order — don't reintroduce a design where it depends on when the bot happens to call `app.onStart()`/`app.onStop()`.

## Testing

Run `bun test` or `just test`. Tests never require a live Discord connection — router/dispatcher tests use hand-built interaction/event stubs (or the fixtures in `src/testing/`), and `createCirce()` accepts `autoLogin: false` plus an injectable REST client specifically so the full app-wiring path is testable without a gateway connection.

## What NOT to add here

Persistence/ORM, dependency injection, event bus, business logic, i18n content, music/moderation/voice systems, bot-specific authorization policy, a plugin ecosystem, sharding infrastructure, a CLI, deployment automation. If a task asks for one of these inside Circe, stop and flag it rather than implementing it — it means either the task is misscoped or it belongs in a consuming bot instead.
