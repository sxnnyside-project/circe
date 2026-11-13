# Changelog

All notable changes to **Circe** are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] — 2026-11-13

### Added

- **Universal Multi-Runtime SQLite Persistence (`@sxnnyside/circe/sqlite`)**:
  - Implements `SqliteCooldownStore` with native zero-copy `bun:sqlite` under Bun and standard library `node:sqlite` (`DatabaseSync`) under Node.js 22.18+, Node.js 24+, and Deno 2.2+ without third-party npm dependencies.
  - Automatically enables Write-Ahead Logging (`PRAGMA journal_mode = WAL`) on disk databases.
  - Precompiles prepared SQL statements at initialization for high throughput.
  - Implements `Symbol.dispose` for ECMAScript Explicit Resource Management (`using store = new SqliteCooldownStore()`).
  - Maintains full backward compatibility via `@sxnnyside/circe/bun-sqlite` and `BunSqliteCooldownStore` proxies.
- **Modern Discord Localization Subsystem (`src/localization/`)**:
  - `DiscordLocale` union covering all 32 official Discord locales with dialect string fallback.
  - `LocalizationContext`, `LocalizationResolver`, `defineLocalizationResolver`, `localizationContextOf`, and `createTranslator`.
  - `@experimental` `resolveInteractionLocale()` with configurable user-vs-guild resolution priority and fallback chains.
  - `@experimental` zero-dependency token interpolator `interpolate()`.
  - First-class support for `nameLocalizations` and `descriptionLocalizations` in hierarchical command group metadata (`_group.ts`).
  - Scans for `localization.ts` by default at the project scan root, with transparent fallback to legacy `i18n.ts`.
- **Symmetric Entry Points & Modular Subpaths**:
  - Canonical 5-entrypoint architecture in `package.json#exports` (`.`, `./testing`, `./cli`, `./sqlite`, `./bun-sqlite`).
  - Added root entry points `src/testing.ts` and `src/cli.ts` mirroring `src/sqlite.ts` and `src/bun-sqlite.ts`.
  - Exported `detectRuntime()` and `Runtime` (`'bun' | 'node' | 'deno'`) at the root entry point for zero-overhead environment introspection.
  - Reorganized and alphabetized barrel exports in `src/index.ts` with descriptive architectural section banners.
- **Developer Tooling Suite & Modular CLI Architecture (`src/cli/`)**:
  - Decomposed CLI into single-responsibility command modules (`add.ts`, `build.ts`, `completions.ts`, `dev.ts`, `doctor.ts`, `help.ts`, `init.ts`, `routes.ts`, `start.ts`, `version.ts`) orchestrated by a lightweight dispatcher.
  - Relocated non-command internals to their canonical architectural layers: `src/application/prepare-app.ts` (IoC application preparation and scanning), `src/config/dotenv.ts` (environment loading), and `src/errors/render-error.ts` (terminal error presentation), removing obsolete internal shims and deleting the unused `src/commands/` directory.
  - `circe init`: Real template-driven project scaffolding from root `templates/` across Bun, Deno, and Node.js in three complexity tiers (`minimal`, `standard`, `advanced`), with CLI flags (`--runtime`, `--template`, `--minimal`, `--standard`, `--advanced`) and host environment auto-detection.
  - `circe doctor`: Pre-flight diagnostic command checking runtime engine floors (Bun >= 1.4.0, Node >= 22.18.0, Deno >= 2.0.0), configuration validity, credential security, and dependency alignment, with `--json` output.
  - `circe routes`: Interactive route inspection command listing slash commands, subcommands, context menus, modals, component prefixes/patterns, and prefix tree collision analysis, with `--json` output.
  - `circe add`: Interactive and flagged code generator for commands (`--guild-only`, `--description`), events (`--once`, Discord enum mapping), components (`--prefix`, `--pattern`), modals, and guards.
  - Zero-dependency "Did you mean ...?" command typo suggestions using Levenshtein distance on usage errors.
  - ANSI-styled `--help` output with colors and dim annotations respecting `NO_COLOR` and non-interactive environments.
- **Interaction Testing Harness 2.0 (`@sxnnyside/circe/testing`)**:
  - `TestExecutionResult` returned by `testCommand()`, `testComponent()`, `testModal()`, and `testContextMenu()` with fluent inspection assertions (`reply`, `followUp`, `hasReply()`, `hasEphemeralReply()`, `hasFollowUp()`, `hasModal()`, `hasLog()`, `isDeferred`, `isReplied`).
  - Comprehensive slash command option resolution on `createTestInteraction()`: `getString()`, `getInteger()`, `getNumber()`, `getBoolean()`, `getUser()`, `getMember()`, `getChannel()`, `getRole()`, `getMentionable()`, `getAttachment()`, and `get()`, enforcing required option constraints.
  - Asynchronous interaction lifecycle simulation: `deferReply()`, `editReply()`, `deleteReply()`, and modal inspection via `showModal()`.
  - Select menu testing in `createTestComponentInteraction()` with `values` arrays, `deferUpdate()`, and `hasUpdate()` assertions.
  - Dedicated `testAutocomplete()` utility and `TestAutocompleteResult` with `hasChoice()` verification.
  - `testGuard()` helper for unit testing authorization and rate-limiting guards in isolation.
  - Strongly-typed Discord object stub builders: `createMockUser()`, `createMockMember()`, `createMockGuild()`, `createMockChannel()`, and `createMockMessage()` with `MockOverrides<T>` support.
- **Observability, Golden Signals & Decoupled Configuration**:
  - Interaction latency telemetry: `InteractionMetric`, `InteractionMetricKind`, `InteractionMetricStatus`, `InteractionTelemetryHandler`, `LatencyAccumulator`, and `createLatencyAccumulator()` computing sliding-window p50, p95, p99 percentiles, throughput, error rates, and guard denial counts.
  - `onInteractionComplete` lifecycle hook wired across commands, subcommands, components, modals, context menus, and autocompletes, isolated via `emitInteractionMetric()`.
  - Decoupled environment validation via `defineEnvConfig` and `SafeParseSchema`, supporting Zod 3, Zod 4, Valibot, ArkType, or any Standard Schema v1 implementation.
  - TypeScript discriminated union on `CirceConfigFile` enforcing `http: { publicKey }` at compile time when `transport` is `'http'` or `'hybrid'`.
  - Added `ctx.addHealthCheck(name, check)` to `CirceIntegrationContext`, enabling integrations to contribute named `/ready` checks without manual wiring.
- **Application & Discord Layer Modernization (2026 Standards)**:
  - Full TSDoc parity across all 42 files in `src/discord/` and all files in `src/application/` (`@public`, `@internal`, `@remarks`, `@param`, `@returns`, `@throws`, `@example`).
  - Explicit Resource Management support: implemented `Symbol.asyncDispose` on `Lifecycle` and `CirceApp` (`createCirce()`), and `Symbol.dispose` on `MemoryCooldownStore` and `MemoryPaginationStore`.
  - Resilient event dispatcher (`createEventHandler`) with correlation tracking, normalized `EventError` boundaries, and isolated per-listener failure reporting.
  - Option autocomplete error boundary with safe fallback response (`interaction.respond([])`).
  - Ephemeral reply safety (`safeEphemeralReply`) using `MessageFlags.Ephemeral` with automatic absorption on expired interactions.
- **Continuous Integration Template Quality Gates**:
  - Automated test suite in `tests/templates/templates-verification.test.ts` verifying contract compliance across all 9 template permutations (Bun, Deno, Node in minimal, standard, advanced).
  - Added `just verify-templates` recipe executing automated template generation and contract validation in continuous integration.
- **AI-native experience**:
  - `circe manifest` writes `.circe/project.json`, a declarative summary of the bot's transport, intents, conventions and routes; `circe manifest --check` fails when it is stale.
  - Official agent skills in `.agents/skills/`, scaffolded by `circe init`, with the exact operating contract for code assistants.
  - `--format json` (alongside `--json`) on the CLI: failures are one structured document with `category`, `issues` and a stable exit code.
- **Atomic cooldowns**: optional `CooldownStore.claim(key, durationMs)` takes a cooldown only if the key is free, in one step. Implemented by `MemoryCooldownStore` and `SqliteCooldownStore` (one conditional upsert, safe across processes sharing the file); the `cooldown()` guard uses it when present and falls back to `check` then `hit` for stores without it.
- **Multi-process paginator**: sessions are plain JSON (`SerializedPaginatorPage`, `PaginationSession.idleUntil`), `PaginationStore` may be asynchronous, and `PaginatorPage.embeds` accepts API embed objects. Replicas that share a store can serve each other's clicks, and an idle timer never disables a pager another process kept alive.
- **Replay protection** in the HTTP transport: a signed interaction whose `id` was already dispatched inside the freshness window is rejected with `409`.
- `prepareApp(cwd, logger, { inspectOnly: true })` discovers modules without reading the environment schema; `circe routes` and `circe manifest` use it, so they run in CI without secrets.
- Autocomplete errors reach the `onError` reporter (`ErrorReportKind` gains `'autocomplete'`).
- CLI value options accept `--name=value`, and a flag is never taken as the value of the option before it.

### Changed

- Command, component, modal and context-menu routers share one pipeline (`src/discord/run-interaction.ts`); behavior and public API are unchanged.
- An error thrown by `middleware.after` is logged instead of replacing the interaction's outcome.
- `circe add` scaffolds reply with `flags: MessageFlags.Ephemeral` instead of the deprecated `ephemeral: true`, and so do the project templates.
- `EnvConfig` takes a second type parameter for its schema, so `CirceConfig<Schema>.schema` keeps its declared type as in 1.1 (`defineEnvConfig` and `defineConfig` return it typed).
- Modernized core dependencies: upgraded `zod` to stable `4.6.7`, `@types/bun` to `1.4.4` (aligned with Bun 1.4 runtime engine), and `discord.js` to `14.28.1`.
- Added test coverage in `tests/config/config.test.ts` for Zod 4 schemas with transforms and coercions, and configured CI (`.github/workflows/ci.yml`) to test both the declared floor (`peer-zod-3: zod@^3.24.0`) and the primary Zod 4 suite.
- Consolidated legacy `i18n` into `src/localization/resolver.ts`, exposing backward-compatible proxies (`I18nResolver`, `I18nContext`, `IdentityI18nResolver`, `defineI18nResolver`, `i18nContextOf`) marked as `@deprecated`.
- `src/config/config.ts` re-exports from `./env-config.js` with `@deprecated`.
- Consolidated observability types into `src/observability/report-error.ts` to eliminate file fragmentation.

### Fixed

- `circe dev` restarts the bot on every change, not only the first.
- A bot-supplied error, guard-denied or unknown-interaction handler that throws is logged instead of becoming an unhandled rejection that shuts the bot down.
- A `stop()` during slow `onStart` hooks no longer lets startup continue to `running` and log in; `start()` rejects.
- `circe add guard` scaffolds a guard that allows (`return true`), and `circe add` escapes quotes in descriptions, prefixes and event names.
- Paginator pages without text no longer keep the text of the previous page.
- The Node HTTP bridge answers `413` to an oversized chunked body instead of resetting the connection.
- `circe doctor` agrees with `circe start` on the HTTP public key and reads the token through the bot's own schema.
- `circe routes` output order no longer depends on the machine's locale.
- `CirceError.toJSON()` uses a `WeakSet<object>` to prevent stack overflow on circular error causes (`[CircularCause]`).
- `CirceError.toJSON()` handles native `JSON.stringify` parameter passing (`key: string` as first argument).
- `CirceError.toJSON()` recursively preserves child errors inside `AggregateError.errors`.
- `CirceError.toJSON()` and metadata serialization safely coerce Discord snowflake BigInt values to string, preventing `TypeError: Do not know how to serialize a BigInt`.
- `normalizeError()` annotates `originalName: value.name` in metadata when wrapping native errors (`TypeError`, `SyntaxError`), preventing loss of error class in APM/observability tools.
- Deno file watcher descriptor leak: `createWatcher().stop()` now explicitly invokes `watcher.close()` under Deno.

---

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

---

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

[Unreleased]: https://github.com/sxnnyside-project/circe/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/sxnnyside-project/circe/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/sxnnyside-project/circe/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sxnnyside-project/circe/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/sxnnyside-project/circe/releases/tag/v0.1.0
