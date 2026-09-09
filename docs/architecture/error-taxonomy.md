# Error Taxonomy

Every authoring-time failure encountered in Circe — invalid configuration, malformed modules, duplicate command names, or failing integrations — is reported through a unified error taxonomy and rendered with a consistent terminal presentation.

---

## 1. Design Principles

1. **One base class**: Every authoring failure inherits from `CirceError` (`src/errors/circe-error.ts`).
2. **Error class defines category**: The class name itself identifies the failure domain (`ModuleValidationError`, `DiscoveryConflictError`, etc.).
3. **Location precedes reason**: Output always states the offending file path and folder rule before explaining the validation error.
4. **Aggregation before failure**: Independent module validation errors are collected and displayed in a single pass rather than failing one by one.
5. **Deterministic exit codes**: Clear distinction between operational errors (code `1`) and unexpected internal failures (code `2`).

---

## 2. Error Categories

| Class | Raised When | Operational |
| :--- | :--- | :---: |
| `ConfigError` | `circe.config.ts` has missing required keys or schema validation fails. | Yes |
| `ModuleValidationError` | A discovered module does not satisfy its category contract (e.g. missing `builder` or `execute`). | Yes |
| `DiscoveryConflictError` | Two modules resolve to the same identity (e.g. duplicate command name or colliding component prefix). | Yes |
| `IntegrationError` | An integration's `setup()` hook throws or violates its context contract. | Yes |
| `CirceError` | Internal framework exceptions not covered by specific subclasses. | Depends on cause |

---

## 3. Terminal Presentation Format

Authoring errors render with file paths, concise diagnostics, and contextual scanning notes:

```
✗ src/commands/moderation/ban.ts
  Does not export a valid CommandDefinition: missing `builder`.
  Scanned as a command because it is located under `commands/`.

✗ src/commands/utility/ping.ts
  Duplicate command name "ping" — already registered by src/commands/fun/ping.ts.

2 error(s) found. Circe did not start.
```

---

## 4. Exit Codes

| Code | Meaning | Resolution |
| :---: | :--- | :--- |
| `0` | Success | Application running or pre-flight check passed. |
| `1` | Operational authoring error | Fix the indicated file or configuration issue. |
| `2` | Non-operational internal error | Internal bug in framework code. |

---

## 5. Relationship to Runtime Errors

This taxonomy governs startup, scanning, and validation errors. Failures occurring during live interaction handling (such as an uncaught exception in a command's `execute`) are caught by interaction error boundaries (`error.ts`), router reply hooks (`onCommandError`), and the global `onError` telemetry dispatcher.

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

