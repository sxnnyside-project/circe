# Runtime Strategy

Circe targets Bun as its primary runtime while providing first-class support for Node.js (22+) and Deno (2+). This document specifies how cross-runtime compatibility is achieved through capability detection and narrow adapter boundaries.

---

## 1. Design Principles

1. **Bun-first optimization, portable fallback**: Where Bun provides higher-performance primitives (`Bun.serve`, native `bun:sqlite`, hot watcher), Circe utilizes them directly. On Node or Deno, portable standards-based implementations (`node:sqlite`, `Deno.serve`, `node:http`) are used without degrading correctness.
2. **Feature detection over version sniffing**: Runtime code checks for standard globals (`crypto.subtle`, `Bun`, `Deno`, `node:sqlite`) rather than parsing fragile version strings.
3. **Explicit adapter boundaries**: Runtime-specific dependencies live behind focused interfaces. Core routers and business logic interact only with the interface, never with runtime globals.
4. **Startup-time resolution**: Runtime detection and adapter selection execute once during boot and are recorded in structured startup logs via `detectRuntime()`.

---

## 2. Runtime Capability Matrix

| Capability | Bun | Node.js 22+ | Deno 2+ |
| :--- | :--- | :--- | :--- |
| **CLI Runtime** | Native (`bun x circe`) | Native (`npx circe`) | Native (`deno task` / `deno run`) |
| **File Watcher (`circe dev`)** | Native Bun watcher | Debounced `fs.watch` | Debounced `fs.watch` |
| **HTTP Interactions Transport** | `Bun.serve` | `node:http` bridge | `Deno.serve` |
| **Request Signature Verification** | Native Web Crypto (`crypto.subtle.verify`) | Native Web Crypto (`crypto.subtle.verify`) | Native Web Crypto (`crypto.subtle.verify`) |
| **SQLite Cooldown Store** (`@sxnnyside/circe/sqlite`) | Native `bun:sqlite` (Bun 1.4+) | Native `node:sqlite` (22.18+ recommended; experimental upstream) | Native `node:sqlite` (Deno 2.2+) |
| **Gateway WebSocket** | Discord.js over WebSocket | Discord.js over WebSocket | Discord.js over WebSocket |

---

## 3. Adapter Contracts

Each runtime-sensitive capability implements a narrow interface:

```ts
interface InteractionsServer {
  stop(): void;
}

interface CooldownStore {
  /** Milliseconds remaining before key is free again, or 0 if free now. */
  check(key: string): number | Promise<number>;
  /** Starts a cooldown of durationMs for key. */
  hit(key: string, durationMs: number): void | Promise<void>;
}
```

### HTTP Server Isolation

The interaction handler `createInteractionsHandler()` produces a portable web-standard `(Request) => Promise<Response>` function. The active server adapter hosts this handler:
- **Bun**: Fed directly to `Bun.serve({ port, fetch })`.
- **Deno**: Fed directly to `Deno.serve({ port, handler })`.
- **Node**: Adapted through a lightweight bridge that translates incoming Node `IncomingMessage`/`ServerResponse` streams into standard `Request`/`Response` objects.

---

## 4. Subpath Packaging

To ensure importing `@sxnnyside/circe` in any environment never triggers module resolution errors or pulls unused dependencies:

- **`@sxnnyside/circe`**: The main application entry point, containing zero runtime-specific native module imports.
- **`@sxnnyside/circe/sqlite`**: Universal SQLite persistence (`SqliteCooldownStore`), auto-detecting `bun:sqlite` under Bun and standard library `node:sqlite` (`DatabaseSync`) under Node.js 22.18+ and Deno 2.2+.
- **`@sxnnyside/circe/bun-sqlite`**: Backward-compatible proxy pointing to `@sxnnyside/circe/sqlite`.
- **`@sxnnyside/circe/testing`**: Offline interaction testing harness, stubs, and fluent assertions.
- **`@sxnnyside/circe/cli`**: Programmatic access to CLI commands, diagnostics, and route inspectors.

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*
