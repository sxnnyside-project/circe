# Circe Documentation

Circe is an inversion-of-control application framework for Discord bots, designed for Bun, Node.js 22+, and Deno.

---

## Sections

### 📐 Architecture Specifications
Authoritative architectural specifications defining Circe's design, directory conventions, and contracts:

- **[Inversion of Control Model](architecture/ioc-model.md)**: Lifecycle ownership from CLI execution (`circe init`, `circe dev`, `circe start`, `circe build`) to interaction dispatching.
- **[Folder Conventions](architecture/folder-conventions.md)**: Directory layout, naming constraints, and routing semantics.
- **[Module Contracts](architecture/module-contracts.md)**: Expected shapes, typed parameters, contexts, pagination (`createPaginator` & `pageSelect`), and validation rules.
- **[Configuration Contract](architecture/config-contract.md)**: Declarative `circe.config.ts` specification, dual-transports, and integrations.
- **[Error Taxonomy](architecture/error-taxonomy.md)**: Diagnostic errors, terminal formatting, and process exit codes.
- **[Runtime Strategy](architecture/runtime-strategy.md)**: Cross-runtime capability detection and adapter boundaries.

### 🚀 Deployment Guides
Step-by-step guides for running and deploying Circe bots in development and production:

- **[Deploying on Bun](deployment/bun.md)**: Running natively with `Bun.serve`, Docker, systemd, and Bun SQLite storage.
- **[Deploying on Node.js 22+](deployment/node.md)**: Running via `npx`, PM2 process management, Docker, and Kubernetes.
- **[Deploying on Deno 2](deployment/deno.md)**: Running with `deno.json`, security permissions, and `Deno.serve`.

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*
