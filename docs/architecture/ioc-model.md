# Inversion of Control Model

Circe's central architectural model is that the framework owns process execution. Rather than writing imperative startup scripts (`await client.login()`, `await app.start()`), the developer supplies declarations in known locations with specified shapes, and the CLI discovers, validates, and wires them into a running application.

This document describes the execution lifecycle from CLI invocation to interaction dispatching.

---

## 1. Execution Lifecycle

```
[CLI Command] (init | dev | start | build | doctor | routes | add)
      │
      ▼
1. Load & Validate Configuration (circe.config.ts)
      │
      ▼
2. Resolve Integrations (context.addScanRoot, onStart / onStop, addHealthCheck)
      │
      ▼
3. Walk Scan Root (commands/, events/, components/, etc.)
      │
      ▼
4. Validate Module Shapes & Check Identity Collisions
      │
      ├─► [Validation Failure] ──► Report via Error Taxonomy & Exit (1)
      │
      ▼
5. Pre-flight Complete (circe build exits 0 here)
      │
      ▼
6. Initialize Application (Gateway login OR HTTP interactions server)
      │
      ▼
7. Dispatch Interactions (Commands, Context Menus, Components, Modals)
```

### Step 1: CLI Invocation
The developer interacts with the framework via the unified `circe` CLI suite:
- **`circe init`**: Scaffolds complete starter projects from real templates (`minimal`, `standard`, `advanced`) across Bun, Deno, and Node.js with non-destructive writes.
- **`circe dev`**: Runs under a child-process supervisor with debounced file watching and live reloading.
- **`circe start`**: Runs the application in production mode, validating credentials and connecting transports.
- **`circe build`**: Stops after pre-flight contract verification without connecting to Discord (ideal for CI pipelines).
- **`circe doctor`**: Inspects runtime engine floors, configuration, environment credentials, and dependency alignment with optional `--json` output.
- **`circe routes`**: Discovers and visualizes all registered interaction paths, component pattern variables, and longest-prefix trees with optional `--json` output.
- **`circe add`**: Scaffolds new interaction handlers (`command`, `event`, `component`, `modal`, `guard`) adhering strictly to project conventions.

### Step 2: Configuration Resolution
The framework loads `circe.config.ts` and validates its structure (`config`, `intents`, `scanRoot`, `transport`, `http`, `integrations`, `health`). See [config-contract.md](config-contract.md).

### Step 3: Integration Resolution
Each integration declared in `circe.config.ts` executes its `setup()` hook. Integrations can contribute additional scan roots, register startup/shutdown lifecycle hooks, or register `/ready` probes via `CirceIntegrationContext`.

### Step 4: Filesystem Scanning
The scanner walks `scanRoot` (default: `./src`) and integration roots. Standard folder conventions (`commands/`, `command-groups/`, `context-menus/`, `events/`, `components/`, `modals/`) and single-file conventions (`middleware.ts`, `error.ts`, `localization.ts` / `i18n.ts`) are discovered automatically. See [folder-conventions.md](folder-conventions.md).

### Step 5: Module Shape Validation
Every discovered module is validated against its category contract. Missing exports (such as a command missing `builder` or `execute`) or identity collisions (such as duplicate command names or conflicting component prefixes) are aggregated and reported before the application starts. See [module-contracts.md](module-contracts.md) and [error-taxonomy.md](error-taxonomy.md).

### Step 6: Application Startup
The CLI passes the resolved registries, configuration, and hooks to `createCirce()`. Depending on the configured `transport` mode:
- **`gateway`**: Connects via WebSocket Gateway using `client.login()`.
- **`http`**: Initializes the interactions server (`Bun.serve`, `Deno.serve`, or `node:http`) with Ed25519 Web Crypto verification; does not establish a Gateway connection.
- **`hybrid`**: Establishes a Gateway connection for events while routing interaction payloads through the HTTP server.

---

## 2. The Programmatic Escape Hatch & Explicit Resource Management

The programmatic `createCirce()` API exported by `@sxnnyside/circe` is the foundation that `circe.config.ts` compiles down to. Every capability used by the CLI is available as an option in `createCirce()`:

- Custom registry injection.
- Custom middleware, error boundaries, and localization resolvers.
- Reply-shaping hooks (`onCommandError`, `onGuardDenied`, etc.).
- Telemetry dispatchers (`onError`, `onInteractionComplete`).
- **Explicit Resource Management (ERM)**: `createCirce()` implements `Symbol.asyncDispose`. Exiting an `await using` scope automatically triggers graceful teardown and client destruction:

```typescript
await using app = createCirce({
  /* ...options */
});
await app.start();
// Automatically calls app.stop() when leaving scope
```

### Modular Packaging

Capabilities are published as cohesive, zero-dependency subpaths:
- `@sxnnyside/circe`: Core framework, IoC engine, and router definitions.
- `@sxnnyside/circe/sqlite`: Universal SQLite persistence (`SqliteCooldownStore`) for Bun, Node 22.18+, and Deno 2.2+.
- `@sxnnyside/circe/testing`: Full interaction mock harness and fluent assertion matchers.
- `@sxnnyside/circe/cli`: Programmatic CLI interfaces and route discovery.

---

## 3. Deliberate Architectural Boundaries

Circe avoids unnecessary architectural indirection:

- **No dependency injection container**: Dependencies are passed explicitly via module imports or context bags.
- **No bespoke plugin architecture**: Integrations only contribute scan roots, lifecycle hooks, and health probes.
- **No wrapper hiding Discord.js**: The underlying Discord.js `interaction` object is exposed directly on `ctx.interaction`.

Inversion of control is achieved purely through filesystem conventions, compiler-grade shape validation, and runtime adapters.

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*
