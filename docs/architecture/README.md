# Architecture Documentation

Circe is an inversion-of-control application framework for Discord bots on Bun, Node.js 22+, and Deno. This directory contains the authoritative specifications for the framework's architecture, conventions, and runtime model.

---

## Index

| Document | Description |
| :--- | :--- |
| [ioc-model.md](ioc-model.md) | The inversion of control lifecycle from CLI boot to interaction routing. |
| [folder-conventions.md](folder-conventions.md) | File-system directory conventions (`commands/`, `events/`, `components/`, etc.). |
| [module-contracts.md](module-contracts.md) | Module shapes, context bags, route matching patterns, and type contracts. |
| [config-contract.md](config-contract.md) | Declarative configuration specification (`circe.config.ts`), transports, and integrations. |
| [error-taxonomy.md](error-taxonomy.md) | Authoring-time error classes, terminal diagnostics, and process exit codes. |
| [runtime-strategy.md](runtime-strategy.md) | Cross-runtime capability detection and adapter contracts across Bun, Node, and Deno. |

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*
