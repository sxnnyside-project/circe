# Changelog

All notable changes to **Circe** are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
