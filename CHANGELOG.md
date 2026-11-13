# Changelog

All notable changes to **Circe** are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Universal SQLite persistence subpath (`@sxnnyside/circe/sqlite`) exposing `SqliteCooldownStore`:
  - Supports native `bun:sqlite` under Bun and standard library `node:sqlite` (`DatabaseSync`) under Node 22.5+, Node 24+, and Deno 2+ with zero external npm dependencies.
  - Automatically enables WAL mode (`PRAGMA journal_mode = WAL`) on disk databases.
  - Precompiles prepared statements once at initialization for high throughput.
  - Implements `Symbol.dispose` for ECMAScript Explicit Resource Management (`using store = new SqliteCooldownStore()`).
- Modern localization subsystem under `src/localization/`:
  - `DiscordLocale` union supporting all 34 Discord official locales with string dialect fallback.
  - `LocalizationContext`, `LocalizationResolver`, `defineLocalizationResolver`, `localizationContextOf`, and `createTranslator`.
  - `@experimental` `resolveInteractionLocale()` with configurable user vs. guild priority and fallback chains.
  - `@experimental` zero-dependency token interpolator `interpolate()`.
  - Added `nameLocalizations` and `descriptionLocalizations` support in `_group.ts` for hierarchical command groups and subcommands.
- Runtime and platform introspection:
  - Exported `detectRuntime()` and `Runtime` (`'bun' | 'node' | 'deno'`) in `@sxnnyside/circe` for zero-overhead global introspection.
  - Exported `createWatcher()` and `Watcher` interface.
- Decoupled environment configuration:
  - `src/config/env-config.ts` (`defineEnvConfig`, `EnvConfig`, `SafeParseSchema`) allowing any validator implementing `safeParse` (Zod, Valibot, ArkType, Standard Schema v1).
  - TypeScript discriminated union on `CirceConfigFile` enforcing `http: { publicKey }` at compile time when `transport` is `'http'` or `'hybrid'`.
- Extensible integration health probes:
  - Added `ctx.addHealthCheck(name, check)` to `CirceIntegrationContext`, allowing extensions to register named `/ready` checks without manual wiring.
- Health probe type ergonomics:
  - Exported `HealthProbeStatus` and `HealthProbeResponse` describing `/health` and `/ready` structured responses.
- Framework-wide TSDoc parity:
  - Comprehensive TSDoc documentation (`@remarks`, `@param`, `@returns`, `@example`, `@defaultValue`, `@throws`, `@see`, `@public`, `@internal`, `@experimental`, `@deprecated`) normalized across `sqlite`, `transport`, `runtime`, `observability`, `logging`, `localization`, `health`, `config`, and `errors`.
- Root entry point symmetry:
  - Mapped root `src/` to strictly 5 canonical entry points matching `package.json#exports` (`index.ts`, `testing/index.ts`, `cli/index.ts`, `sqlite.ts`, `bun-sqlite.ts`).

### Changed

- Consolidated legacy `i18n` into `src/localization/resolver.ts`, exposing backward-compatible proxies (`I18nResolver`, `I18nContext`, `IdentityI18nResolver`, `defineI18nResolver`, `i18nContextOf`) marked as `@deprecated`.
- The CLI scanner now looks for `localization.ts` first at the scan root, with seamless fallback to `i18n.ts`.
- `src/config/config.ts` re-exports from `./env-config.js` with `@deprecated`.
- `src/bun-sqlite.ts` and `src/discord/guards/cooldown/bun-sqlite-store.ts` are backward-compatible proxies pointing to universal `SqliteCooldownStore` with driver `'bun'` by default.
- Consolidated observability types into `src/observability/report-error.ts` to reduce file fragmentation.

### Fixed

- `CirceError.toJSON()` uses a `WeakSet<object>` to prevent stack overflow on circular error causes (`[CircularCause]`).
- `CirceError.toJSON()` handles native `JSON.stringify` parameter passing (`key: string` as first argument).
- `CirceError.toJSON()` recursively preserves child errors inside `AggregateError.errors`.
- `CirceError.toJSON()` and metadata serialization safely coerce Discord snowflake BigInt values to string, preventing `TypeError: Do not know how to serialize a BigInt`.
- `normalizeError()` annotates `originalName: value.name` in metadata when wrapping native errors (`TypeError`, `SyntaxError`), preventing loss of error class in APM/observability tools.
- Deno file watcher descriptor leak: `createWatcher().stop()` now explicitly invokes `watcher.close()` under Deno.

## [1.1.0] — 2026-10-14

### Added

- Context menu commands accept `defaultMemberPermissions`, `contexts`, `integrationTypes` and `nameLocalizations`, applied at registration.
- `guards` on components and modals, with `onComponentGuardDenied` / `onModalGuardDenied` hooks (also accepted by `error.ts`).
- `invokerOnly()` guard for components, and `invokerOnly` option on `createPaginator` to restrict paging to the user who ran the command.
- `onReady(hook)` on integrations and on the app: runs with the logged-in `Client` once the gateway is ready.
- `I18nResolver.resolve` receives an `I18nContext` (`guildId`, `guildLocale`, `userId`) as a fourth argument.
- `ctx.t` on autocomplete contexts.
- `client` option (config file and `createCirce`): `partials`, `presence`, `allowedMentions`, cache/sweeper policy and any other discord.js `ClientOptions` except `intents`.
- `health` option: `/health` (liveness) and `/ready` (readiness with named checks) served before login, optionally bound to a `host`.
- `app.every()` / `ctx.every()`: non-overlapping interval tasks started on ready and cleared on shutdown. Registered after ready, they start immediately; non-positive intervals are rejected.
- `onUnhandledRejection: 'exit' | 'log'` option on `createCirce` and in `circe.config.ts`: `'log'` keeps the bot running after an unhandled rejection.
- `shutdownTimeoutMs` option on `createCirce` and in `circe.config.ts` (positive, finite): a signal- or crash-triggered shutdown that outlives it forces exit code 1; a second signal forces it immediately.
- `./package.json` subpath export, and external sourcemaps with chunks under `dist/chunks/` in the published build.

### Changed

- `engines.node` is `>=22.18.0`, the first Node.js that runs `circe.config.ts` without a flag. On an older Node, `circe start|dev|build` explains this instead of printing `Unknown file extension ".ts"`.
- `zod` peer range is `^3.24.0 || ^4.0.0`; CI runs the type check and tests against zod 4.
- `circe init` generates a project that passes `circe build`: the example command has a name, `circe.config.ts` imports `./src/config.ts`, and a `tsconfig.json` allows `.ts` import specifiers. Its next steps name the package manager that ran it.
- The CLI loads `.env` from the working directory (Bun already did; Node and Deno did not). Variables already set in the environment win.
- `guildOnly()`, `hasPermission()` and `cooldown()` are typed over the context slice they read, so the same guard works on commands, context menus, components and modals. Assignable wherever a `Guard` was accepted; code that relied on their exact return type should re-check.
- `circe <command> --help` and `--version` print help/version instead of running the command.
- `bun run check` builds before running tests, so the cross-runtime Deno test always has a `dist/` to use.
- Default error and denial replies set `flags: MessageFlags.Ephemeral` instead of the deprecated `ephemeral` option. `circe/testing` still records them as `ephemeral: true`.
- `zod` is a peer dependency (`^3.24.0`) rather than a dependency: Circe only uses its types, which appear in the public API.
- The HTTP transport answers 401 for missing signature headers before buffering the request body.
- `app.stop()` runs `onStop` hooks and stops the health server even when `client.destroy()` throws, then rethrows. Overlapping `stop()` calls share one shutdown.
- `circe/testing` records replies whose `flags` include `Ephemeral` (number, array or bitfield) as `ephemeral: true` and keeps any other flag in `flags`.

### Fixed

- Native `Error` values in log metadata are written with `name`, `message`, `stack` and `cause` instead of `{}`.
- `circe dev` loads `circe.config.ts` through the same loader as `start` and `build`, so it reports the same errors, and finds the CLI through `process.argv[1]`.
- `cooldown()` keys include the command group and subcommand, so sibling leaves sharing a store no longer share a cooldown.
- A port already in use is reported by name and stops `circe start` and the health server instead of surfacing as a raw exception.
- A rejected second `start()` no longer tears down the already-running application.
- Command registration honours `client.rest` options (custom `api` base, timeouts), like the gateway client does.
- A failed `start()` no longer leaves the process half-alive: stop hooks run for whatever started, the gateway client is destroyed and the health server is closed. Stop hooks must therefore tolerate a partially started application.
- The HTTP interactions endpoint rejects request bodies over 1 MB with `413` before reading them into memory, and rejects signed requests whose timestamp is more than 5 minutes from now (`401`, logged with the measured skew).
- `circe start` in `http`/`hybrid` mode stops its HTTP server on shutdown instead of keeping the process alive until killed.
- `circe start` logs structured JSON at info level when `NODE_ENV=production`.
- `BunSqliteCooldownStore` periodically deletes expired rows instead of keeping never-rechecked keys forever.
- `createPaginator().reply()` throws a clear error for an empty page list.
- `/ready` reuses its check results for one second.
- `build` removes `dist/` first, and no longer ships declaration maps that pointed to unpublished sources.

## [1.0.0] — 2026-09-09

### Added

- **Inversion of Control CLI (`circe`)**:
  - `circe dev`: Hot-reloading development runner with child-process isolation, debounced file watching, and clean cache resets.
  - `circe start`: Production runner loading declarative `circe.config.ts`.
  - `circe build`: Pre-flight verification mode that scans all files, checks module shapes, and validates configuration in CI without establishing a Discord connection.
- **Mandatory File Conventions**:
  - Semantic auto-discovery for `commands/`, `command-groups/`, `context-menus/`, `events/`, `components/`, and `modals/`.
  - Default export of any module in standard directories is automatically registered without explicit `.load()` calls.
  - Single-file conventions: `middleware.ts` (with `before`/`after` execution hooks), `error.ts` (centralized error boundary), and `i18n.ts` (custom translation resolver).
- **Hierarchical Subcommand Routing**:
  - Support for `command-groups/` directory trees up to Discord's two-level limit (`group -> subgroup -> command`).
  - `defineCommandGroup()` for parent `_group.ts` metadata and inherited group-level guards.
  - Unified assembly into a single top-level `SlashCommandBuilder` with consistent lifecycle and correlation tracing.
- **Context Menus Support**:
  - `defineUserCommand()` and `defineMessageCommand()` for user and message context menus under `context-menus/users/` and `context-menus/messages/`.
  - Bulk REST registration unified in the same `PUT` request alongside slash commands.
- **Dual-Transport Architecture**:
  - Support for HTTP Webhook mode (`transport: "http"`) and Hybrid mode (`transport: "hybrid"`) alongside Gateway WebSocket mode (`transport: "gateway"`).
  - Multi-runtime interactions server supporting `Bun.serve` on Bun, `Deno.serve` on Deno 2, and high-performance `node:http` bridge on Node.js 22+.
- **Zero-Dependency Ed25519 Web Crypto**:
  - Native signature verification for Discord Webhooks via standard `crypto.subtle.verify`.
- **Native Rate Limiting & Cooldowns**:
  - Composable `cooldown()` guard supporting `user`, `guild`, and `channel` scopes.
  - Default `MemoryCooldownStore` with automatic unreferenced interval sweeping.
  - Optional `BunSqliteCooldownStore` via `@sxnnyside/circe/bun-sqlite` for sub-millisecond local SQLite persistence.
- **Typed Component Route Matching**:
  - Added `pattern` support to `defineComponent()` (e.g. `pattern: "ticket:close:[ticketId]:[action]"`).
  - Recursive TypeScript conditional type inference providing typed route parameters directly on `ctx.params`.
- **Interaction I18n Context**:
  - Added `ctx.t(key, params)` helper resolving against `interaction.locale`.
  - Pluggable `I18nResolver` interface with automatic convention discovery via `i18n.ts` at the scan root.
- **Observability & Error Telemetry**:
  - Enterprise `onError: ErrorReporter` hook on `createCirce()` dispatching to Sentry/OpenTelemetry across all 4 routers and event dispatcher.
  - Transparent `AsyncLocalStorage` correlation ID propagation across all commands, components, events, and logs.
- **Offline Testing Harness**:
  - Expanded `@sxnnyside/circe/testing` with `testComponent()`, `createTestComponentInteraction()`, and subcommand option simulation in `createTestInteraction()`.

### Changed

- Inverted process lifecycle: the framework owns startup via `circe` CLI; manual `app.start()` is now an internal escape hatch.
- Replaced imperative loader invocations (`app.commands.load()`) with convention-driven filesystem scanning.
- Optimized interaction dispatching with zero-allocation middleware execution when no `middleware.ts` is present.

### Removed

- Deprecated boilerplate-heavy manual registration patterns in favor of declarative module definitions.

---

## [0.1.0] — 2026-08-20

### Added

- Initial release of Circe Discord bot framework with core lifecycle state machine, structured logging, correlation context, and basic command/event routers.

---

[Unreleased]: https://github.com/sxnnyside-project/circe/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sxnnyside-project/circe/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/sxnnyside-project/circe/releases/tag/v0.1.0
